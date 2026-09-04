/**
 * [INPUT]: 依赖可信 PlatformSession、DeviceStore 原子 heartbeat 审计闸门、数据库事务、AuditSink、Sa-Token gateway 与 ID generator。
 * [OUTPUT]: 提供 enroll/限频 heartbeat/active check、管理员 list/get/revoke 的设备用例。
 * [POS]: device application 的唯一状态编排，数据库状态与防洪审计同事务，单设备 Token 撤销在提交后执行。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.device.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditActorType;
import com.owndsh.enterprise.audit.AuditEvent;
import com.owndsh.enterprise.audit.AuditResult;
import com.owndsh.enterprise.audit.AuditSink;
import com.owndsh.enterprise.audit.EmptyAuditMetadata;
import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.application.PlatformSessionGateway;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.device.domain.DeviceStatus;
import com.owndsh.enterprise.device.domain.EnterpriseDevice;
import com.owndsh.enterprise.device.persistence.DeviceStore;
import com.owndsh.enterprise.revision.RevisionConflictException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.function.LongSupplier;

public final class DeviceService {
    private final TransactionOperations transactions;
    private final DeviceStore devices;
    private final AuditSink auditSink;
    private final PlatformSessionGateway sessions;
    private final LongSupplier ids;
    private final Clock clock;

    public DeviceService(
        TransactionOperations transactions,
        DeviceStore devices,
        AuditSink auditSink,
        PlatformSessionGateway sessions,
        LongSupplier ids
    ) {
        this(transactions, devices, auditSink, sessions, ids, Clock.systemUTC());
    }

    DeviceService(
        TransactionOperations transactions,
        DeviceStore devices,
        AuditSink auditSink,
        PlatformSessionGateway sessions,
        LongSupplier ids,
        Clock clock
    ) {
        this.transactions = Objects.requireNonNull(transactions, "transactions");
        this.devices = Objects.requireNonNull(devices, "devices");
        this.auditSink = Objects.requireNonNull(auditSink, "auditSink");
        this.sessions = Objects.requireNonNull(sessions, "sessions");
        this.ids = Objects.requireNonNull(ids, "ids");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public EnterpriseDevice enroll(DeviceCallContext context, DeviceEnrollment enrollment) {
        PlatformSession session = requireHarness(context);
        UUID installationId = sessionInstallation(session);
        if (!installationId.equals(enrollment.installationId())) {
            throw new DeviceAccessException("ENT_PERMISSION_DENIED");
        }
        return requireResult(transactions.execute(status -> {
            Instant now = Instant.now(clock);
            EnterpriseDevice existing = devices.findByInstallation(context.tenantId(), installationId).orElse(null);
            boolean created = false;
            if (existing == null) {
                try {
                    devices.insert(positiveId(), context.tenantId(), session.userId(), enrollment, now);
                    created = true;
                } catch (DuplicateKeyException exception) {
                    existing = devices.findByInstallation(context.tenantId(), installationId).orElseThrow();
                }
            }
            if (existing != null) {
                requireOwnerAndActive(existing, session.userId());
                if (!devices.updateEnrollment(
                    context.tenantId(), installationId, session.userId(), enrollment, now
                )) {
                    throw new DeviceAccessException("ENT_DEVICE_REVOKED");
                }
            }
            EnterpriseDevice enrolled = devices.findByInstallation(context.tenantId(), installationId)
                .orElseThrow(DeviceNotFoundException::new);
            audit(
                context,
                enrolled,
                AuditAction.DEVICE_ENROLLED,
                new DeviceEnrollmentMetadata(enrollment.platform(), created)
            );
            return enrolled;
        }));
    }

    public EnterpriseDevice heartbeat(DeviceCallContext context, DeviceHeartbeat heartbeat) {
        PlatformSession session = requireHarness(context);
        UUID installationId = sessionInstallation(session);
        return requireResult(transactions.execute(status -> {
            EnterpriseDevice existing = devices.findByInstallation(context.tenantId(), installationId)
                .orElseThrow(DeviceNotFoundException::new);
            requireOwnerAndActive(existing, session.userId());
            DeviceStore.HeartbeatResult heartbeatResult = devices.heartbeat(
                context.tenantId(),
                installationId,
                session.userId(),
                heartbeat,
                Instant.now(clock)
            );
            if (!heartbeatResult.updated()) {
                throw new DeviceAccessException("ENT_DEVICE_REVOKED");
            }
            EnterpriseDevice updated = devices.findByInstallation(context.tenantId(), installationId)
                .orElseThrow(DeviceNotFoundException::new);
            if (heartbeatResult.auditDue()) {
                audit(
                    context,
                    updated,
                    AuditAction.DEVICE_HEARTBEAT,
                    new DeviceHeartbeatMetadata(
                        heartbeat.desiredRevision(),
                        heartbeat.pendingSessionEvents(),
                        heartbeat.lastSuccessfulSyncAt() != null
                    )
                );
            }
            return updated;
        }));
    }

    public EnterpriseDevice requireActive(DeviceCallContext context) {
        PlatformSession session = requireHarness(context);
        EnterpriseDevice device = devices.findByInstallation(context.tenantId(), sessionInstallation(session))
            .orElseThrow(DeviceNotFoundException::new);
        requireOwnerAndActive(device, session.userId());
        return device;
    }

    public List<EnterpriseDevice> list(DeviceCallContext context, long afterId, int limit) {
        requireAdmin(context);
        return devices.list(context.tenantId(), afterId, limit);
    }

    public EnterpriseDevice get(DeviceCallContext context, long deviceId) {
        requireAdmin(context);
        return devices.findById(context.tenantId(), deviceId).orElseThrow(DeviceNotFoundException::new);
    }

    public EnterpriseDevice revoke(DeviceCallContext context, long deviceId, long expectedRevision) {
        requireAdmin(context);
        RevokeResult result = requireResult(transactions.execute(status -> {
            EnterpriseDevice current = devices.findById(context.tenantId(), deviceId)
                .orElseThrow(DeviceNotFoundException::new);
            if (current.revision() != expectedRevision) {
                throw new RevisionConflictException(expectedRevision, current.revision());
            }
            if (current.status() == DeviceStatus.REVOKED) return new RevokeResult(current, false);
            if (!devices.revoke(context.tenantId(), deviceId, expectedRevision, Instant.now(clock))) {
                EnterpriseDevice actual = devices.findById(context.tenantId(), deviceId)
                    .orElseThrow(DeviceNotFoundException::new);
                throw new RevisionConflictException(expectedRevision, actual.revision());
            }
            EnterpriseDevice revoked = devices.findById(context.tenantId(), deviceId)
                .orElseThrow(DeviceNotFoundException::new);
            audit(context, revoked, AuditAction.DEVICE_REVOKED, new EmptyAuditMetadata());
            return new RevokeResult(revoked, true);
        }));
        if (result.changed()) {
            sessions.revokeHarnessDevice(result.device().userId(), result.device().installationId().toString());
        }
        return result.device();
    }

    private PlatformSession requireHarness(DeviceCallContext context) {
        PlatformSession session = context.session();
        if (session.client() != PlatformClient.DSH_DESKTOP || !"harness".equals(session.deviceType())) {
            throw new DeviceAccessException("ENT_PERMISSION_DENIED");
        }
        return session;
    }

    private static void requireAdmin(DeviceCallContext context) {
        if (context.session().client() != PlatformClient.ENTERPRISE_ADMIN
            || !"console".equals(context.session().deviceType())) {
            throw new DeviceAccessException("ENT_PERMISSION_DENIED");
        }
    }

    private static UUID sessionInstallation(PlatformSession session) {
        try {
            UUID value = UUID.fromString(session.deviceId());
            if (value.version() != 4) throw new IllegalArgumentException("not v4");
            return value;
        } catch (IllegalArgumentException exception) {
            throw new DeviceAccessException("ENT_PERMISSION_DENIED");
        }
    }

    private static void requireOwnerAndActive(EnterpriseDevice device, long userId) {
        if (device.userId() != userId) throw new DeviceBindingConflictException();
        if (device.status() != DeviceStatus.ACTIVE) throw new DeviceAccessException("ENT_DEVICE_REVOKED");
    }

    private void audit(
        DeviceCallContext context,
        EnterpriseDevice device,
        AuditAction action,
        com.owndsh.enterprise.audit.AuditMetadata metadata
    ) {
        auditSink.append(new AuditEvent(
            positiveId(), context.tenantId(), Instant.now(clock), AuditActorType.USER,
            context.session().userId(), device.id(), action, "DEVICE", Long.toString(device.id()),
            AuditResult.SUCCESS, null, context.requestId(), context.sourceIp(), context.userAgentHash(), metadata
        ));
    }

    private long positiveId() {
        long value = ids.getAsLong();
        if (value <= 0) throw new IllegalStateException("ID generator 返回非正数");
        return value;
    }

    private static <T> T requireResult(T result) {
        return Objects.requireNonNull(result, "事务没有返回结果");
    }

    private record RevokeResult(EnterpriseDevice device, boolean changed) {
    }
}
