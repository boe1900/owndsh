/**
 * [INPUT]: 依赖 route/parser 后请求、quota 状态机、DeepSeek SSE、SecretCipher、事务、audit 与 Jackson。
 * [OUTPUT]: 对外提供首 event 预取后的 OpenAI SSE relay，含续租、usage settle、CHARGED_MAX 和双审计。
 * [POS]: model/gateway 的生命周期核心；网络期间不持有数据库事务，prompt 与 credential 只存在于局部变量。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import org.dromara.enterprise.audit.AuditAction;
import org.dromara.enterprise.audit.AuditActorType;
import org.dromara.enterprise.audit.AuditEvent;
import org.dromara.enterprise.audit.AuditResult;
import org.dromara.enterprise.audit.AuditSink;
import org.dromara.enterprise.crypto.SecretAad;
import org.dromara.enterprise.crypto.SecretCipher;
import org.dromara.enterprise.crypto.SecretPurpose;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.model.gateway.DeepSeekUpstreamClient.SseEvent;
import org.dromara.enterprise.model.gateway.DeepSeekUpstreamClient.UpstreamExchange;
import org.dromara.enterprise.quota.application.QuotaReservationCommand;
import org.dromara.enterprise.quota.application.QuotaReservationService;
import org.dromara.enterprise.quota.application.QuotaTokenEstimator;
import org.dromara.enterprise.quota.application.UsageTokens;
import org.dromara.enterprise.quota.domain.UsageLedger;
import org.springframework.transaction.support.TransactionOperations;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.LongSupplier;

public final class ModelGatewayService {
    private static final Duration LEASE_RENEW_INTERVAL = Duration.ofSeconds(30);
    private static final String PROVIDER_TABLE = "ent_model_provider";
    private static final String PROVIDER_FIELD = "credential_ciphertext";

    private final TransactionOperations transactions;
    private final GatewayRouteResolver routes;
    private final QuotaReservationService quotas;
    private final DeepSeekUpstreamClient upstream;
    private final SecretCipher cipher;
    private final AuditSink audit;
    private final LongSupplier ids;
    private final JsonMapper json;
    private final Clock clock;

    public ModelGatewayService(
        TransactionOperations transactions,
        GatewayRouteResolver routes,
        QuotaReservationService quotas,
        DeepSeekUpstreamClient upstream,
        SecretCipher cipher,
        AuditSink audit,
        LongSupplier ids,
        JsonMapper json
    ) {
        this(transactions, routes, quotas, upstream, cipher, audit, ids, json, Clock.systemUTC());
    }

    ModelGatewayService(
        TransactionOperations transactions,
        GatewayRouteResolver routes,
        QuotaReservationService quotas,
        DeepSeekUpstreamClient upstream,
        SecretCipher cipher,
        AuditSink audit,
        LongSupplier ids,
        JsonMapper json,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.routes = Objects.requireNonNull(routes, "routes");
        this.quotas = Objects.requireNonNull(quotas, "quotas");
        this.upstream = Objects.requireNonNull(upstream, "upstream");
        this.cipher = Objects.requireNonNull(cipher, "cipher");
        this.audit = Objects.requireNonNull(audit, "audit");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.json = Objects.requireNonNull(json, "json");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public GatewayStream open(DeviceCallContext context, GatewayChatRequest request, UUID idempotencyKey) {
        GatewayRouteResolver.GatewayRoute route = routes.resolve(context, request.modelAlias());
        if (request.reasoningEnabled() && !route.model().reasoning()) {
            throw new IllegalArgumentException("该受管模型不支持 reasoning");
        }
        long estimated = QuotaTokenEstimator.estimate(
            request.visibleUtf8Bytes(), request.maxTokens(), route.model().maxOutputTokens()
        );
        if (estimated > route.model().contextWindow()) {
            throw new IllegalArgumentException("请求超过模型 context window");
        }
        QuotaReservationService.ActiveReservation active = quotas.reserve(new QuotaReservationCommand(
            context.tenantId(), route.user().id(), route.user().departmentId(), route.device().id(),
            route.model().id(), idempotencyKey, context.requestId(), estimated,
            context.sourceIp(), context.userAgentHash()
        ));
        Instant startedAt = Instant.now(clock);
        try {
            active = markAccepted(context, route, active, estimated, startedAt);
        } catch (RuntimeException exception) {
            quotas.release(active);
            throw exception;
        }

        UpstreamExchange exchange = null;
        try {
            byte[] body = json.writeValueAsBytes(request.upstreamBody(route.model().upstreamModel()));
            exchange = openUpstream(context.tenantId(), route, body);
            SseEvent first = exchange.next();
            inspect(first);
            return new GatewayStream(context, route, active, exchange, first, startedAt);
        } catch (RuntimeException exception) {
            if (exchange != null) exchange.close();
            finishChargedMax(context, route, active, startedAt, failure(exception));
            throw sanitize(exception);
        }
    }

    private UpstreamExchange openUpstream(
        String tenantId,
        GatewayRouteResolver.GatewayRoute route,
        byte[] requestBody
    ) {
        byte[] plaintext = null;
        char[] credential = null;
        try {
            plaintext = cipher.decrypt(
                SecretPurpose.PROVIDER_SECRET,
                new SecretAad(
                    tenantId, PROVIDER_TABLE, Long.toString(route.provider().id()), PROVIDER_FIELD,
                    SecretCipher.KEY_VERSION
                ),
                route.provider().encryptedCredential()
            );
            credential = decodeUtf8(plaintext);
            return upstream.open(
                route.provider().baseUrl(), credential, requestBody,
                route.provider().connectTimeoutMs(), route.provider().readTimeoutMs()
            );
        } finally {
            if (credential != null) Arrays.fill(credential, '\0');
            if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
            Arrays.fill(requestBody, (byte) 0);
        }
    }

    private QuotaReservationService.ActiveReservation markAccepted(
        DeviceCallContext context,
        GatewayRouteResolver.GatewayRoute route,
        QuotaReservationService.ActiveReservation active,
        long estimated,
        Instant occurredAt
    ) {
        QuotaReservationService.ActiveReservation result = transactions.execute(status -> {
            QuotaReservationService.ActiveReservation sent = quotas.markSent(active);
            audit.append(new AuditEvent(
                positiveId(), context.tenantId(), occurredAt, AuditActorType.USER, route.user().id(),
                route.device().id(), AuditAction.MODEL_REQUEST_ACCEPTED, "MODEL_REQUEST",
                sent.reservation().id().toString(), AuditResult.SUCCESS, null, context.requestId(),
                context.sourceIp(), context.userAgentHash(),
                new GatewayAcceptedMetadata(route.model().id(), sent.reservation().id(), estimated)
            ));
            return sent;
        });
        return Objects.requireNonNull(result, "accepted 事务没有返回 reservation");
    }

    private UsageLedger finishSettled(
        DeviceCallContext context,
        GatewayRouteResolver.GatewayRoute route,
        QuotaReservationService.ActiveReservation active,
        UsageTokens usage,
        String upstreamRequestId,
        Instant startedAt
    ) {
        UsageLedger ledger = transactions.execute(status -> {
            UsageLedger settled = quotas.settle(active, usage, upstreamRequestId);
            appendFinished(
                context, route, active, settled.totalTokens(), startedAt,
                GatewayFinishedMetadata.Outcome.SETTLED, GatewayFinishedMetadata.Failure.NONE
            );
            return settled;
        });
        return Objects.requireNonNull(ledger, "finished 事务没有返回 ledger");
    }

    private UsageLedger finishChargedMax(
        DeviceCallContext context,
        GatewayRouteResolver.GatewayRoute route,
        QuotaReservationService.ActiveReservation active,
        Instant startedAt,
        GatewayFinishedMetadata.Failure failure
    ) {
        UsageLedger ledger = transactions.execute(status -> {
            UsageLedger charged = quotas.chargeMax(active);
            appendFinished(
                context, route, active, charged.totalTokens(), startedAt,
                GatewayFinishedMetadata.Outcome.CHARGED_MAX, failure
            );
            return charged;
        });
        return Objects.requireNonNull(ledger, "charge-max 事务没有返回 ledger");
    }

    private void appendFinished(
        DeviceCallContext context,
        GatewayRouteResolver.GatewayRoute route,
        QuotaReservationService.ActiveReservation active,
        long tokens,
        Instant startedAt,
        GatewayFinishedMetadata.Outcome outcome,
        GatewayFinishedMetadata.Failure failure
    ) {
        Instant now = Instant.now(clock);
        audit.append(new AuditEvent(
            positiveId(), context.tenantId(), now, AuditActorType.USER, route.user().id(), route.device().id(),
            AuditAction.MODEL_REQUEST_FINISHED, "MODEL_REQUEST", active.reservation().id().toString(),
            outcome == GatewayFinishedMetadata.Outcome.SETTLED ? AuditResult.SUCCESS : AuditResult.FAILURE,
            failure == GatewayFinishedMetadata.Failure.NONE ? null : failure.name(), context.requestId(),
            context.sourceIp(), context.userAgentHash(),
            new GatewayFinishedMetadata(
                route.model().id(), active.reservation().id(), outcome, tokens,
                Math.max(0, Duration.between(startedAt, now).toMillis()), failure
            )
        ));
    }

    private Inspection inspect(SseEvent event) {
        if (event.done()) return new Inspection(true, null);
        try {
            JsonNode root = json.readTree(event.data());
            if (root == null || !root.isObject() || root.has("error")) {
                throw new GatewayException(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE);
            }
            JsonNode choices = root.get("choices");
            JsonNode usage = root.get("usage");
            if ((choices == null || !choices.isArray()) && (usage == null || !usage.isObject())) {
                throw new GatewayException(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE);
            }
            return new Inspection(false, usage == null || usage.isNull() ? null : parseUsage(usage));
        } catch (GatewayException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new GatewayException(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE, exception);
        }
    }

    private static UsageTokens parseUsage(JsonNode usage) {
        if (!usage.isObject()) throw new GatewayException(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE);
        long input = firstUsage(usage, "input_tokens", "prompt_tokens");
        long output = firstUsage(usage, "output_tokens", "completion_tokens");
        long cache = sumUsage(
            usage, "cache_read_tokens", "cache_write_tokens", "cache_read_input_tokens",
            "cache_creation_input_tokens", "prompt_cache_hit_tokens"
        );
        JsonNode details = usage.get("prompt_tokens_details");
        if (details != null && details.isObject()) cache = Math.addExact(cache, optionalUsage(details, "cached_tokens"));
        return new UsageTokens(input, output, cache);
    }

    private static long firstUsage(JsonNode usage, String primary, String fallback) {
        if (usage.has(primary)) return requiredUsage(usage, primary);
        if (usage.has(fallback)) return requiredUsage(usage, fallback);
        throw new GatewayException(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE);
    }

    private static long sumUsage(JsonNode usage, String... fields) {
        long result = 0;
        for (String field : fields) result = Math.addExact(result, optionalUsage(usage, field));
        return result;
    }

    private static long optionalUsage(JsonNode usage, String field) {
        return usage.has(field) ? requiredUsage(usage, field) : 0;
    }

    private static long requiredUsage(JsonNode usage, String field) {
        JsonNode value = usage.get(field);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToLong() || value.longValue() < 0) {
            throw new GatewayException(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE);
        }
        return value.longValue();
    }

    private static char[] decodeUtf8(byte[] bytes) {
        CharBuffer decoded = null;
        try {
            decoded = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes));
            char[] result = new char[decoded.remaining()];
            decoded.get(result);
            if (result.length == 0) throw new IllegalStateException("provider credential 不能为空");
            return result;
        } catch (CharacterCodingException exception) {
            throw new IllegalStateException("provider credential 编码非法", exception);
        } finally {
            if (decoded != null && decoded.hasArray()) Arrays.fill(decoded.array(), '\0');
        }
    }

    private long positiveId() {
        long id = ids.getAsLong();
        if (id <= 0) throw new IllegalStateException("ID generator 必须返回正数");
        return id;
    }

    private static RuntimeException sanitize(RuntimeException exception) {
        if (exception instanceof GatewayException) return exception;
        return new GatewayException(GatewayException.Kind.PLATFORM_UNAVAILABLE, exception);
    }

    private static GatewayFinishedMetadata.Failure failure(RuntimeException exception) {
        if (!(exception instanceof GatewayException gateway)) return GatewayFinishedMetadata.Failure.PLATFORM_FAILURE;
        return switch (gateway.kind()) {
            case UPSTREAM_AUTH_FAILED -> GatewayFinishedMetadata.Failure.UPSTREAM_AUTH_FAILED;
            case UPSTREAM_INVALID_RESPONSE -> GatewayFinishedMetadata.Failure.UPSTREAM_INVALID_RESPONSE;
            case UPSTREAM_UNAVAILABLE -> GatewayFinishedMetadata.Failure.UPSTREAM_UNAVAILABLE;
            case UPSTREAM_TIMEOUT -> GatewayFinishedMetadata.Failure.UPSTREAM_TIMEOUT;
            case PLATFORM_UNAVAILABLE, MODEL_NOT_ASSIGNED, REQUEST_TOO_LARGE ->
                GatewayFinishedMetadata.Failure.PLATFORM_FAILURE;
        };
    }

    private record Inspection(boolean done, UsageTokens usage) {
    }

    public final class GatewayStream {
        private final DeviceCallContext context;
        private final GatewayRouteResolver.GatewayRoute route;
        private final AtomicReference<QuotaReservationService.ActiveReservation> active;
        private final UpstreamExchange exchange;
        private final SseEvent first;
        private final Instant startedAt;
        private final AtomicBoolean finished = new AtomicBoolean();
        private final AtomicReference<RuntimeException> heartbeatFailure = new AtomicReference<>();
        private final Object lifecycle = new Object();

        private GatewayStream(
            DeviceCallContext context,
            GatewayRouteResolver.GatewayRoute route,
            QuotaReservationService.ActiveReservation active,
            UpstreamExchange exchange,
            SseEvent first,
            Instant startedAt
        ) {
            this.context = context;
            this.route = route;
            this.active = new AtomicReference<>(active);
            this.exchange = exchange;
            this.first = first;
            this.startedAt = startedAt;
        }

        public void writeTo(OutputStream output) throws IOException {
            ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(
                Thread.ofVirtual().name("enterprise-gateway-lease-", 0).factory()
            );
            ScheduledFuture<?> renewal = heartbeat.scheduleAtFixedRate(
                this::renew, LEASE_RENEW_INTERVAL.toSeconds(), LEASE_RENEW_INTERVAL.toSeconds(), TimeUnit.SECONDS
            );
            UsageTokens usage = null;
            try (exchange) {
                SseEvent event = first;
                while (true) {
                    RuntimeException renewalError = heartbeatFailure.get();
                    if (renewalError != null) throw renewalError;
                    Inspection inspection = inspect(event);
                    if (inspection.usage() != null) usage = inspection.usage();
                    if (inspection.done()) {
                        finish(usage, usage == null
                            ? GatewayFinishedMetadata.Failure.USAGE_MISSING
                            : GatewayFinishedMetadata.Failure.NONE);
                        output.write(event.wireBytes());
                        output.flush();
                        return;
                    }
                    output.write(event.wireBytes());
                    output.flush();
                    event = exchange.next();
                }
            } catch (IOException clientCancelled) {
                try {
                    finish(null, GatewayFinishedMetadata.Failure.CLIENT_CANCELLED);
                } catch (RuntimeException ignored) {
                    // 客户端已离线；reservation 由恢复任务兜底，不能覆盖取消信号。
                }
                throw clientCancelled;
            } catch (RuntimeException exception) {
                RuntimeException terminal = heartbeatFailure.get() == null ? exception : heartbeatFailure.get();
                RuntimeException clientError = sanitize(terminal);
                try {
                    finish(null, failure(terminal));
                } catch (RuntimeException settlementFailure) {
                    clientError = new GatewayException(GatewayException.Kind.PLATFORM_UNAVAILABLE, settlementFailure);
                }
                writeError(output, clientError);
            } finally {
                renewal.cancel(true);
                heartbeat.shutdownNow();
            }
        }

        private void renew() {
            if (finished.get()) return;
            try {
                synchronized (lifecycle) {
                    if (!finished.get()) active.set(quotas.renew(active.get()));
                }
            } catch (RuntimeException exception) {
                heartbeatFailure.compareAndSet(null, exception);
                exchange.close();
            }
        }

        private void finish(UsageTokens usage, GatewayFinishedMetadata.Failure failure) {
            if (!finished.compareAndSet(false, true)) return;
            synchronized (lifecycle) {
                if (usage != null && failure == GatewayFinishedMetadata.Failure.NONE) {
                    finishSettled(context, route, active.get(), usage, exchange.upstreamRequestId(), startedAt);
                } else {
                    finishChargedMax(context, route, active.get(), startedAt, failure);
                }
            }
        }

        private void writeError(OutputStream output, RuntimeException exception) {
            try {
                GatewayException gateway = exception instanceof GatewayException value
                    ? value
                    : new GatewayException(GatewayException.Kind.PLATFORM_UNAVAILABLE);
                ObjectNode root = json.createObjectNode();
                root.putObject("error")
                    .put("code", gateway.code())
                    .put("message", "企业模型流中断")
                    .put("type", "enterprise_gateway_error")
                    .put("request_id", context.requestId());
                output.write("data: ".getBytes(StandardCharsets.UTF_8));
                output.write(json.writeValueAsBytes(root));
                output.write("\n\n".getBytes(StandardCharsets.UTF_8));
                output.flush();
            } catch (IOException ignored) {
                // 客户端已经断开时不能再写终端错误帧。
            }
        }
    }
}
