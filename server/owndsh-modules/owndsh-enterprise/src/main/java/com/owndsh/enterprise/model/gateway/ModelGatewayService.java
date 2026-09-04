/**
 * [INPUT]: 依赖请求级 route、原生协议请求、quota 状态机、透明上游 SSE、SecretCipher、事务与 audit。
 * [OUTPUT]: 对外提供三协议透明 relay、仅用于配额预留的保守估算、同步 2xx SSE 建连、流内故障原生结束、脱敏失败日志与可靠终态结算。
 * [POS]: model/gateway 的治理核心；只解析 usage/终态，不转换消息、工具、推理、回放或流事件。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.gateway;

import lombok.extern.slf4j.Slf4j;
import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditActorType;
import com.owndsh.enterprise.audit.AuditEvent;
import com.owndsh.enterprise.audit.AuditResult;
import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.crypto.SecretAad;
import com.owndsh.enterprise.crypto.SecretCipher;
import com.owndsh.enterprise.crypto.SecretPurpose;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.model.domain.ProviderApiProtocol;
import com.owndsh.enterprise.model.gateway.DeepSeekUpstreamClient.SseEvent;
import com.owndsh.enterprise.model.gateway.DeepSeekUpstreamClient.UpstreamExchange;
import com.owndsh.enterprise.quota.application.QuotaReservationCommand;
import com.owndsh.enterprise.quota.application.QuotaReservationService;
import com.owndsh.enterprise.quota.application.QuotaTokenEstimator;
import com.owndsh.enterprise.quota.application.UsageTokens;
import com.owndsh.enterprise.quota.domain.ReservationState;
import com.owndsh.enterprise.quota.domain.UsageLedger;
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
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.LongSupplier;

@Slf4j
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

    public GatewayStream open(
        DeviceCallContext context,
        GatewayChatRequest request,
        ProviderApiProtocol protocol,
        Map<String, String> headers,
        UUID idempotencyKey
    ) {
        GatewayRouteResolver.GatewayRoute route = routes.resolve(context, request.modelAlias());
        if (route.provider().apiProtocol() != protocol) throw new IllegalArgumentException("模型 API 协议不匹配");
        long estimated = QuotaTokenEstimator.estimate(
            request.visibleUtf8Bytes(), request.maxTokens(), route.model().resolvedMaxTokens()
        );
        Map<String, String> upstreamHeaders = Map.copyOf(headers);
        ObjectNode upstreamBody = request.upstreamBody(route.model().modelId(), protocol);
        QuotaReservationService.ActiveReservation active = quotas.reserve(new QuotaReservationCommand(
            context.tenantId(), route.user().id(), route.user().departmentId(), route.device().id(),
            route.model().id(), idempotencyKey, context.requestId(), estimated,
            context.sourceIp(), context.userAgentHash()
        ));
        Instant startedAt = Instant.now(clock);
        UpstreamExchange exchange = null;
        try {
            exchange = openUpstream(
                context.tenantId(), route, upstreamHeaders, json.writeValueAsBytes(upstreamBody)
            );
            active = markAccepted(context, route, active, estimated, startedAt);
            return new GatewayStream(context, route, active, protocol, exchange, startedAt);
        } catch (RuntimeException exception) {
            if (exchange != null) exchange.close();
            logFailure(context, route, protocol, exception, exchange);
            try {
                quotas.release(active);
            } catch (RuntimeException releaseFailure) {
                throw new GatewayException(GatewayException.Kind.PLATFORM_UNAVAILABLE, releaseFailure);
            }
            throw sanitize(exception);
        }
    }

    private UpstreamExchange openUpstream(
        String tenantId,
        GatewayRouteResolver.GatewayRoute route,
        Map<String, String> headers,
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
                route.provider().baseUrl(), route.provider().apiProtocol(), credential, headers, requestBody,
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

    private static UsageTokens parseOpenAiUsage(JsonNode usage) {
        if (!usage.isObject()) throw invalidUpstream();
        long input = firstUsage(usage, "input_tokens", "prompt_tokens");
        long output = firstUsage(usage, "output_tokens", "completion_tokens");
        long cache = sumUsage(
            usage, "cache_read_tokens", "cache_write_tokens", "cache_read_input_tokens",
            "cache_creation_input_tokens", "prompt_cache_hit_tokens"
        );
        JsonNode details = usage.get("input_tokens_details");
        if (details != null && details.isObject()) cache = Math.addExact(cache, optionalUsage(details, "cached_tokens"));
        details = usage.get("prompt_tokens_details");
        if (details != null && details.isObject()) cache = Math.addExact(cache, optionalUsage(details, "cached_tokens"));
        if (cache > input) throw invalidUpstream();
        return new UsageTokens(input - cache, output, cache);
    }

    private static long firstUsage(JsonNode usage, String primary, String fallback) {
        if (usage.has(primary)) return requiredUsage(usage, primary);
        if (usage.has(fallback)) return requiredUsage(usage, fallback);
        throw invalidUpstream();
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
            throw invalidUpstream();
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
            case UPSTREAM_RATE_LIMITED, UPSTREAM_QUOTA_EXCEEDED, UPSTREAM_UNAVAILABLE ->
                GatewayFinishedMetadata.Failure.UPSTREAM_UNAVAILABLE;
            case UPSTREAM_TIMEOUT -> GatewayFinishedMetadata.Failure.UPSTREAM_TIMEOUT;
            case PLATFORM_UNAVAILABLE, MODEL_NOT_ASSIGNED, REQUEST_TOO_LARGE ->
                GatewayFinishedMetadata.Failure.PLATFORM_FAILURE;
        };
    }

    private static GatewayException invalidUpstream() {
        return invalidUpstream(GatewayException.Detail.INVALID_EVENT);
    }

    private static GatewayException invalidUpstream(GatewayException.Detail detail) {
        return new GatewayException(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE, detail);
    }

    private static void logFailure(
        DeviceCallContext context,
        GatewayRouteResolver.GatewayRoute route,
        ProviderApiProtocol protocol,
        RuntimeException exception,
        UpstreamExchange exchange
    ) {
        if (exception instanceof GatewayException gateway) {
            String upstreamRequestId = gateway.upstreamRequestId();
            if (upstreamRequestId == null && exchange != null) upstreamRequestId = exchange.upstreamRequestId();
            log.warn(
                "企业模型请求失败 requestId={} modelId={} providerId={} protocol={} kind={} detail={} upstreamStatus={} upstreamRequestId={}",
                context.requestId(), route.model().id(), route.provider().id(), protocol,
                gateway.kind(), gateway.detail(), gateway.upstreamStatus(), upstreamRequestId
            );
            return;
        }
        log.error(
            "企业模型请求失败 requestId={} modelId={} providerId={} protocol={} type={}",
            context.requestId(), route.model().id(), route.provider().id(), protocol,
            exception.getClass().getSimpleName()
        );
    }

    private record Inspection(boolean terminal, UsageTokens usage) {
    }

    private final class UsageInspector {
        private final ProviderApiProtocol protocol;
        private UsageTokens latest;
        private long anthropicInput;
        private long anthropicOutput;
        private long anthropicCache;
        private boolean sawAnthropicInput;
        private boolean sawAnthropicOutput;

        private UsageInspector(ProviderApiProtocol protocol) {
            this.protocol = protocol;
        }

        private Inspection inspect(SseEvent event) {
            if (event.done()) {
                if (protocol != ProviderApiProtocol.OPENAI_COMPLETIONS) throw invalidUpstream();
                return new Inspection(true, latest);
            }
            ObjectNode root;
            try {
                JsonNode parsed = json.readTree(event.data());
                if (parsed == null || !parsed.isObject()) throw invalidUpstream();
                root = parsed.asObject();
            } catch (GatewayException exception) {
                throw exception;
            } catch (RuntimeException exception) {
                throw new GatewayException(GatewayException.Kind.UPSTREAM_INVALID_RESPONSE, exception);
            }
            if (root.has("error")) throw invalidUpstream(GatewayException.Detail.UPSTREAM_ERROR_EVENT);
            return switch (protocol) {
                case OPENAI_COMPLETIONS -> inspectCompletions(root);
                case OPENAI_RESPONSES -> inspectResponses(root);
                case ANTHROPIC_MESSAGES -> inspectAnthropic(root);
            };
        }

        private Inspection inspectCompletions(ObjectNode root) {
            JsonNode usage = root.get("usage");
            if (usage != null && !usage.isNull()) latest = parseOpenAiUsage(usage);
            if ((!root.path("choices").isArray()) && usage == null) throw invalidUpstream();
            return new Inspection(false, latest);
        }

        private Inspection inspectResponses(ObjectNode root) {
            String type = requiredType(root);
            if ("error".equals(type) || "response.failed".equals(type)) {
                throw invalidUpstream(GatewayException.Detail.UPSTREAM_ERROR_EVENT);
            }
            if (!"response.completed".equals(type) && !"response.incomplete".equals(type)) {
                return new Inspection(false, latest);
            }
            JsonNode usage = root.path("response").get("usage");
            if (usage != null && !usage.isNull()) latest = parseOpenAiUsage(usage);
            return new Inspection(true, latest);
        }

        private Inspection inspectAnthropic(ObjectNode root) {
            String type = requiredType(root);
            if ("error".equals(type)) throw invalidUpstream(GatewayException.Detail.UPSTREAM_ERROR_EVENT);
            if ("message_start".equals(type)) updateAnthropic(root.path("message").get("usage"));
            if ("message_delta".equals(type)) updateAnthropic(root.get("usage"));
            if (!"message_stop".equals(type)) return new Inspection(false, latest);
            if (sawAnthropicInput && sawAnthropicOutput) {
                latest = new UsageTokens(anthropicInput, anthropicOutput, anthropicCache);
            }
            return new Inspection(true, latest);
        }

        private void updateAnthropic(JsonNode usage) {
            if (usage == null || !usage.isObject()) return;
            if (usage.has("input_tokens")) {
                anthropicInput = requiredUsage(usage, "input_tokens");
                sawAnthropicInput = true;
            }
            if (usage.has("output_tokens")) {
                anthropicOutput = requiredUsage(usage, "output_tokens");
                sawAnthropicOutput = true;
            }
            if (usage.has("cache_read_input_tokens") || usage.has("cache_creation_input_tokens")) {
                anthropicCache = sumUsage(usage, "cache_read_input_tokens", "cache_creation_input_tokens");
            }
        }

        private String requiredType(ObjectNode root) {
            JsonNode type = root.get("type");
            if (type == null || !type.isString() || type.stringValue().isBlank()) throw invalidUpstream();
            return type.stringValue();
        }
    }

    public final class GatewayStream {
        private final DeviceCallContext context;
        private final GatewayRouteResolver.GatewayRoute route;
        private final AtomicReference<QuotaReservationService.ActiveReservation> active;
        private final ProviderApiProtocol protocol;
        private final UpstreamExchange exchange;
        private final Instant startedAt;
        private final AtomicBoolean finished = new AtomicBoolean();
        private final AtomicReference<RuntimeException> heartbeatFailure = new AtomicReference<>();
        private final Object lifecycle = new Object();

        private GatewayStream(
            DeviceCallContext context,
            GatewayRouteResolver.GatewayRoute route,
            QuotaReservationService.ActiveReservation active,
            ProviderApiProtocol protocol,
            UpstreamExchange exchange,
            Instant startedAt
        ) {
            this.context = context;
            this.route = route;
            this.active = new AtomicReference<>(active);
            this.protocol = protocol;
            this.exchange = exchange;
            this.startedAt = startedAt;
        }

        public void writeTo(OutputStream output) throws IOException {
            ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(
                Thread.ofVirtual().name("enterprise-gateway-lease-", 0).factory()
            );
            ScheduledFuture<?> renewal = null;
            UsageInspector inspector = new UsageInspector(protocol);
            UsageTokens usage = null;
            try {
                output.write(": enterprise-gateway\n\n".getBytes(StandardCharsets.UTF_8));
                output.flush();
                try (UpstreamExchange current = exchange) {
                    renewal = heartbeat.scheduleAtFixedRate(
                        this::renew, LEASE_RENEW_INTERVAL.toSeconds(), LEASE_RENEW_INTERVAL.toSeconds(),
                        TimeUnit.SECONDS
                    );
                    while (true) {
                        RuntimeException renewalError = heartbeatFailure.get();
                        if (renewalError != null) throw renewalError;
                        SseEvent event = current.next();
                        Inspection inspection = inspector.inspect(event);
                        if (inspection.usage() != null) usage = inspection.usage();
                        if (inspection.terminal()) {
                            finish(usage, usage == null
                                ? GatewayFinishedMetadata.Failure.USAGE_MISSING
                                : GatewayFinishedMetadata.Failure.NONE);
                            output.write(event.wireBytes());
                            output.flush();
                            return;
                        }
                        output.write(event.wireBytes());
                        output.flush();
                    }
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
                logFailure(context, route, protocol, terminal, exchange);
                try {
                    finish(null, failure(terminal));
                } catch (RuntimeException settlementFailure) {
                    logFailure(context, route, protocol, settlementFailure, exchange);
                }
            } finally {
                if (renewal != null) renewal.cancel(true);
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
                QuotaReservationService.ActiveReservation current = active.get();
                if (current.reservation().state() == ReservationState.RESERVED) {
                    quotas.release(current);
                } else if (usage != null && failure == GatewayFinishedMetadata.Failure.NONE) {
                    finishSettled(context, route, current, usage, exchange.upstreamRequestId(), startedAt);
                } else {
                    finishChargedMax(context, route, current, startedAt, failure);
                }
            }
        }

    }
}
