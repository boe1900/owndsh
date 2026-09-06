/**
 * [INPUT]: 依赖请求级 route、原生协议请求、quota 状态机、透明上游 SSE、SecretCipher、事务与 audit。
 * [OUTPUT]: 提供三协议 relay、发送前意图、全程租约、串行 SSE 心跳探活、取消清理与独立 usage 结算。
 * [POS]: model/gateway 的治理核心；消息与工具保持透明，计量观察委托 GatewayUsageInspector，传输失败不抹去实测用量。
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
import com.owndsh.enterprise.quota.domain.UsageResult;
import org.springframework.transaction.support.TransactionOperations;
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
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.LongSupplier;

@Slf4j
public final class ModelGatewayService {
    private static final Duration LEASE_RENEW_INTERVAL = Duration.ofSeconds(30);
    private static final long KEEPALIVE_SECONDS = 5;
    private static final byte[] KEEPALIVE = ": enterprise-gateway\n\n".getBytes(StandardCharsets.UTF_8);
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
    private final Duration leaseRenewInterval;

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
        this(transactions, routes, quotas, upstream, cipher, audit, ids, json, Clock.systemUTC(), LEASE_RENEW_INTERVAL);
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
        Clock clock,
        Duration leaseRenewInterval
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
        this.leaseRenewInterval = Objects.requireNonNull(leaseRenewInterval, "leaseRenewInterval");
        if (leaseRenewInterval.toMillis() < 1) throw new IllegalArgumentException("续租间隔必须为正数");
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
        int modelMaxTokens = route.model().resolvedMaxTokens();
        int effectiveMaxTokens = request.maxTokens() == null ? modelMaxTokens : request.maxTokens();
        long estimated = QuotaTokenEstimator.estimate(
            request.visibleUtf8Bytes(), effectiveMaxTokens, modelMaxTokens
        );
        Map<String, String> upstreamHeaders = Map.copyOf(headers);
        ObjectNode upstreamBody = request.upstreamBody(route.model().modelId(), protocol, effectiveMaxTokens);
        QuotaReservationService.ActiveReservation active = quotas.reserve(new QuotaReservationCommand(
            context.tenantId(), route.user().id(), route.user().departmentId(), route.device().id(),
            route.model().id(), idempotencyKey, context.requestId(), estimated,
            context.sourceIp(), context.userAgentHash()
        ));
        Instant startedAt = Instant.now(clock);
        GatewayStream stream = new GatewayStream(context, route, active, protocol, startedAt);
        try {
            stream.startRenewal();
            stream.connectingThread = Thread.currentThread();
            stream.exchange = openUpstream(
                context.tenantId(), route, upstreamHeaders, json.writeValueAsBytes(upstreamBody), () -> {
                    synchronized (stream.lifecycle) {
                        stream.checkLease();
                        stream.active.set(markAccepted(context, route, stream.active.get(), estimated, startedAt));
                    }
                }
            );
            stream.checkLease();
            return stream;
        } catch (RuntimeException exception) {
            logFailure(context, route, protocol, exception, stream.exchange);
            try {
                stream.finishOpenFailure(exception);
            } catch (RuntimeException settlementFailure) {
                logFailure(context, route, protocol, settlementFailure, stream.exchange);
            } finally {
                stream.stop();
            }
            throw sanitize(exception);
        } finally {
            stream.connectingThread = null;
        }
    }

    private UpstreamExchange openUpstream(
        String tenantId,
        GatewayRouteResolver.GatewayRoute route,
        Map<String, String> headers,
        byte[] requestBody,
        Runnable beforeSend
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
            beforeSend.run();
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
        Instant startedAt,
        GatewayFinishedMetadata.Failure failure
    ) {
        UsageLedger ledger = transactions.execute(status -> {
            UsageLedger settled = quotas.settle(active, usage, upstreamRequestId);
            appendFinished(
                context, route, active, settled.chargedTokens(), startedAt,
                GatewayFinishedMetadata.Outcome.valueOf(settled.result().name()),
                settled.result() == UsageResult.CHARGED_MAX && failure == GatewayFinishedMetadata.Failure.NONE
                    ? GatewayFinishedMetadata.Failure.USAGE_MISSING : failure
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
                context, route, active, charged.chargedTokens(), startedAt,
                GatewayFinishedMetadata.Outcome.valueOf(charged.result().name()), failure
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
            failure == GatewayFinishedMetadata.Failure.NONE ? AuditResult.SUCCESS : AuditResult.FAILURE,
            failure == GatewayFinishedMetadata.Failure.NONE ? null : failure.name(), context.requestId(),
            context.sourceIp(), context.userAgentHash(),
            new GatewayFinishedMetadata(
                route.model().id(), active.reservation().id(), outcome, tokens,
                Math.max(0, Duration.between(startedAt, now).toMillis()), failure
            )
        ));
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

    public final class GatewayStream implements AutoCloseable {
        private final DeviceCallContext context;
        private final GatewayRouteResolver.GatewayRoute route;
        private final AtomicReference<QuotaReservationService.ActiveReservation> active;
        private final ProviderApiProtocol protocol;
        private volatile UpstreamExchange exchange;
        private volatile Thread connectingThread;
        private final Instant startedAt;
        private final AtomicBoolean finished = new AtomicBoolean();
        private final AtomicBoolean stopped = new AtomicBoolean();
        private final AtomicBoolean cancelled = new AtomicBoolean();
        private final AtomicReference<RuntimeException> heartbeatFailure = new AtomicReference<>();
        private final Object lifecycle = new Object();
        private final ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(
            Thread.ofVirtual().name("enterprise-gateway-lease-", 0).factory()
        );
        private ScheduledFuture<?> renewal;
        private volatile UsageTokens usage;

        private GatewayStream(
            DeviceCallContext context,
            GatewayRouteResolver.GatewayRoute route,
            QuotaReservationService.ActiveReservation active,
            ProviderApiProtocol protocol,
            Instant startedAt
        ) {
            this.context = context;
            this.route = route;
            this.active = new AtomicReference<>(active);
            this.protocol = protocol;
            this.startedAt = startedAt;
        }

        public void writeTo(OutputStream output) throws IOException {
            GatewayUsageInspector inspector = new GatewayUsageInspector(protocol, json);
            try {
                checkActive();
                output.write(KEEPALIVE);
                output.flush();
                while (true) {
                    SseEvent event = nextEvent(output);
                    GatewayUsageInspector.Inspection inspection;
                    synchronized (lifecycle) {
                        checkActive();
                        inspection = inspector.inspect(event);
                        if (inspection.usage() != null && !inspection.usage().equals(usage)) {
                            usage = inspection.usage();
                            quotas.recordUsage(active.get(), usage, exchange.upstreamRequestId());
                        }
                        if (inspection.terminal()) {
                            finish(usage == null
                                ? GatewayFinishedMetadata.Failure.USAGE_MISSING
                                : GatewayFinishedMetadata.Failure.NONE);
                        }
                    }
                    output.write(event.wireBytes());
                    output.flush();
                    if (inspection.terminal()) return;
                }
            } catch (IOException clientCancelled) {
                cancelled.set(true);
                stop();
                try {
                    finish(GatewayFinishedMetadata.Failure.CLIENT_CANCELLED);
                } catch (RuntimeException ignored) {
                    // 客户端已离线；reservation 由恢复任务兜底，不能覆盖取消信号。
                }
                throw clientCancelled;
            } catch (RuntimeException exception) {
                if (cancelled.get()) throw new IOException("client cancelled", exception);
                RuntimeException terminal = heartbeatFailure.get() == null ? exception : heartbeatFailure.get();
                logFailure(context, route, protocol, terminal, exchange);
                try {
                    finish(failure(terminal));
                } catch (RuntimeException settlementFailure) {
                    logFailure(context, route, protocol, settlementFailure, exchange);
                }
                writeError(output, terminal);
            } finally {
                stop();
            }
        }

        private SseEvent nextEvent(OutputStream output) throws IOException {
            checkActive();
            FutureTask<SseEvent> pending = new FutureTask<>(exchange::next);
            Thread.ofVirtual().name("enterprise-gateway-event").start(pending);
            try {
                while (true) {
                    try {
                        return pending.get(KEEPALIVE_SECONDS, TimeUnit.SECONDS);
                    } catch (TimeoutException waiting) {
                        checkActive();
                        // 等待上游时仍由同一写线程探活，阻塞写入不占用独立的续租线程。
                        output.write(KEEPALIVE);
                        output.flush();
                    }
                }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IOException("stream interrupted", exception);
            } catch (ExecutionException exception) {
                if (exception.getCause() instanceof RuntimeException runtime) throw runtime;
                throw new GatewayException(GatewayException.Kind.UPSTREAM_UNAVAILABLE, exception.getCause());
            } finally {
                pending.cancel(true);
            }
        }

        private void checkActive() throws IOException {
            if (cancelled.get()) throw new IOException("client cancelled");
            checkLease();
        }

        private void startRenewal() {
            renewal = heartbeat.scheduleAtFixedRate(this::renew, leaseRenewInterval.toMillis(),
                leaseRenewInterval.toMillis(), TimeUnit.MILLISECONDS);
        }

        private void checkLease() {
            RuntimeException error = heartbeatFailure.get();
            if (error != null) throw error;
        }

        private void renew() {
            if (finished.get() || stopped.get()) return;
            try {
                synchronized (lifecycle) {
                    if (!finished.get() && !stopped.get()) active.set(quotas.renew(active.get()));
                }
            } catch (RuntimeException exception) {
                heartbeatFailure.compareAndSet(null, exception);
                UpstreamExchange current = exchange;
                if (current != null) current.close();
                Thread connecting = connectingThread;
                if (connecting != null) connecting.interrupt();
            }
        }

        private void finish(GatewayFinishedMetadata.Failure failure) {
            synchronized (lifecycle) {
                if (finished.get()) return;
                QuotaReservationService.ActiveReservation current = active.get();
                if (current.reservation().state() == ReservationState.RESERVED) {
                    quotas.release(current);
                } else if (usage != null) {
                    finishSettled(context, route, current, usage, exchange.upstreamRequestId(), startedAt, failure);
                } else {
                    finishChargedMax(context, route, current, startedAt, failure);
                }
                finished.set(true);
            }
        }

        private void finishOpenFailure(RuntimeException exception) {
            synchronized (lifecycle) {
                QuotaReservationService.ActiveReservation current = active.get();
                boolean rejected = exception instanceof GatewayException gateway
                    && gateway.detail() == GatewayException.Detail.HTTP_STATUS
                    && gateway.upstreamStatus() != null && gateway.upstreamStatus() >= 400
                    && gateway.upstreamStatus() < 500 && gateway.upstreamStatus() != 408;
                if (current.reservation().state() == ReservationState.SENT && rejected) {
                    transactions.executeWithoutResult(status -> {
                        quotas.releaseRejected(current);
                        appendFinished(context, route, current, 0, startedAt,
                            GatewayFinishedMetadata.Outcome.RELEASED, failure(exception));
                    });
                    finished.set(true);
                } else {
                    finish(failure(exception));
                }
            }
        }

        private void writeError(OutputStream output, RuntimeException exception) throws IOException {
            String code = exception instanceof GatewayException gateway ? gateway.code() : "ENT_PLATFORM_UNAVAILABLE";
            ObjectNode event = json.createObjectNode();
            if (protocol == ProviderApiProtocol.OPENAI_RESPONSES) {
                event.put("type", "error").put("code", code).put("message", code);
            } else {
                if (protocol == ProviderApiProtocol.ANTHROPIC_MESSAGES) event.put("type", "error");
                event.putObject("error").put("type", "api_error").put("code", code).put("message", code);
            }
            String prefix = protocol == ProviderApiProtocol.OPENAI_COMPLETIONS ? "" : "event: error\n";
            output.write((prefix + "data: " + json.writeValueAsString(event) + "\n\n").getBytes(StandardCharsets.UTF_8));
            output.flush();
        }

        private void stop() {
            if (!stopped.compareAndSet(false, true)) return;
            if (renewal != null) renewal.cancel(false);
            heartbeat.shutdown();
            if (exchange != null) exchange.close();
        }

        @Override
        public void close() {
            cancelled.set(true);
            stop();
            finish(GatewayFinishedMetadata.Failure.CLIENT_CANCELLED);
        }
    }
}
