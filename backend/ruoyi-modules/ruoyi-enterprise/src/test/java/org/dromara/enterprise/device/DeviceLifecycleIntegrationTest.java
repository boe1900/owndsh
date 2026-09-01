/**
 * [INPUT]: 依赖真实 PostgreSQL migration、JdbcDeviceStore、JdbcAuditSink、DeviceService 与 fake Sa-Token port。
 * [OUTPUT]: 验证多设备注册、owner 固定、心跳审计限频/状态切换、revision CAS 与单设备撤销隔离。
 * [POS]: T05 设备数据库/事务验收，状态与审计均落真实 PostgreSQL，只有外部 Sa-Token port 被替换。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.device;

import org.dromara.enterprise.audit.JdbcAuditSink;
import org.dromara.enterprise.auth.application.AuthFlowException;
import org.dromara.enterprise.auth.application.IssuedPlatformSession;
import org.dromara.enterprise.auth.application.PlatformSession;
import org.dromara.enterprise.auth.application.PlatformSessionGateway;
import org.dromara.enterprise.auth.domain.PlatformClient;
import org.dromara.enterprise.device.application.DeviceAccessException;
import org.dromara.enterprise.device.application.DeviceBindingConflictException;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.device.application.DeviceEnrollment;
import org.dromara.enterprise.device.application.DeviceHeartbeat;
import org.dromara.enterprise.device.application.DeviceService;
import org.dromara.enterprise.device.domain.DeviceStatus;
import org.dromara.enterprise.device.persistence.JdbcDeviceStore;
import org.dromara.enterprise.revision.RevisionConflictException;
import org.dromara.enterprise.test.PostgresTestDatabase;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class DeviceLifecycleIntegrationTest {
    private static final long USER_ID = 1761100000000000003L;
    private static final long OTHER_USER_ID = 1761100000000000004L;
    private static final long ADMIN_ID = 1761100000000000001L;
    private static final UUID FIRST = UUID.fromString("123e4567-e89b-42d3-a456-426614174000");
    private static final UUID SECOND = UUID.fromString("123e4567-e89b-42d3-a456-426614174001");

    @Test
    void revokesOnlyOneDeviceAndKeepsTheOtherSessionDeviceActive() {
        var database = PostgresTestDatabase.create("device_lifecycle");
        PostgresTestDatabase.migrate(database, null);
        var store = new JdbcDeviceStore(database.jdbc());
        var gateway = new RecordingSessionGateway();
        AtomicLong ids = new AtomicLong(1910000000000000000L);
        DeviceService service = new DeviceService(
            new TransactionTemplate(new DataSourceTransactionManager(database.dataSource())),
            store,
            new JdbcAuditSink(database.jdbc(), JsonMapper.builder().findAndAddModules().build()),
            gateway,
            ids::incrementAndGet
        );

        var first = service.enroll(harness(FIRST, USER_ID), enrollment(FIRST, "Alice Mac"));
        var second = service.enroll(harness(SECOND, USER_ID), enrollment(SECOND, "Alice Linux"));
        var degradedHeartbeat = new DeviceHeartbeat(
            "0.2.9", "0.1.1", 8,
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            12,
            Instant.parse("2026-08-18T06:00:00Z")
        );
        var heartbeat = service.heartbeat(harness(SECOND, USER_ID), degradedHeartbeat);
        assertThat(heartbeat.status()).isEqualTo(DeviceStatus.ACTIVE);
        assertThat(heartbeat.enterpriseBundleVersion()).isEqualTo("0.1.1");
        assertThat(heartbeat.desiredRevision()).isEqualTo(8);
        assertThat(heartbeat.pluginInventoryDigest())
            .isEqualTo("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
        assertThat(heartbeat.pendingSessionEvents()).isEqualTo(12);
        assertThat(heartbeat.lastSuccessfulSyncAt()).isEqualTo(Instant.parse("2026-08-18T06:00:00Z"));
        assertThat(heartbeat.lastHeartbeatAuditAt()).isNotNull();

        service.heartbeat(harness(SECOND, USER_ID), degradedHeartbeat);
        assertThat(heartbeatAuditCount(database)).isOne();

        var recoveredHeartbeat = new DeviceHeartbeat(
            "0.2.9", "0.1.1", 8,
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            0,
            Instant.parse("2026-08-18T06:05:00Z")
        );
        service.heartbeat(harness(SECOND, USER_ID), recoveredHeartbeat);
        assertThat(heartbeatAuditCount(database)).isEqualTo(2);
        service.heartbeat(harness(SECOND, USER_ID), recoveredHeartbeat);
        assertThat(heartbeatAuditCount(database)).isEqualTo(2);

        database.jdbc().update(
            "update ent_device set last_heartbeat_audit_at = now() - interval '2 hours' where id = ?",
            second.id()
        );
        service.heartbeat(harness(SECOND, USER_ID), recoveredHeartbeat);
        assertThat(heartbeatAuditCount(database)).isEqualTo(3);

        assertThatThrownBy(() -> service.enroll(
            harness(FIRST, OTHER_USER_ID), enrollment(FIRST, "Stolen Device")
        )).isInstanceOfSatisfying(
            DeviceBindingConflictException.class,
            exception -> assertThat(exception.errorCode()).isEqualTo("ENT_DEVICE_ALREADY_BOUND")
        );

        assertThatThrownBy(() -> service.enroll(
            harness(FIRST, USER_ID), enrollment(SECOND, "Forged Installation")
        )).isInstanceOfSatisfying(
            DeviceAccessException.class,
            exception -> assertThat(exception.code()).isEqualTo("ENT_PERMISSION_DENIED")
        );

        DeviceCallContext admin = admin();
        assertThatThrownBy(() -> service.revoke(admin, first.id(), first.revision() + 1))
            .isInstanceOf(RevisionConflictException.class);
        var revoked = service.revoke(admin, first.id(), first.revision());

        assertThat(revoked.status()).isEqualTo(DeviceStatus.REVOKED);
        assertThat(gateway.revoked).containsExactly(USER_ID + ":" + FIRST);
        assertThat(service.get(admin, second.id()).status()).isEqualTo(DeviceStatus.ACTIVE);
        assertThat(service.requireActive(harness(SECOND, USER_ID)).id()).isEqualTo(second.id());
        assertThatThrownBy(() -> service.requireActive(harness(FIRST, USER_ID)))
            .isInstanceOfSatisfying(
                DeviceAccessException.class,
                exception -> assertThat(exception.code()).isEqualTo("ENT_DEVICE_REVOKED")
            );

        assertThat(database.jdbc().queryForList(
            "select action from ent_audit_event order by id", String.class
        )).containsExactly(
            "DEVICE_ENROLLED",
            "DEVICE_ENROLLED",
            "DEVICE_HEARTBEAT",
            "DEVICE_HEARTBEAT",
            "DEVICE_HEARTBEAT",
            "DEVICE_REVOKED"
        );
        assertThat(database.jdbc().queryForObject(
            "select count(*) from ent_device where user_id = ? and status = 'ACTIVE'",
            Integer.class,
            USER_ID
        )).isEqualTo(1);
    }

    private static int heartbeatAuditCount(PostgresTestDatabase.Database database) {
        return database.jdbc().queryForObject(
            "select count(*) from ent_audit_event where action = 'DEVICE_HEARTBEAT'",
            Integer.class
        );
    }

    private static DeviceEnrollment enrollment(UUID installationId, String name) {
        return new DeviceEnrollment(installationId, name, "darwin-arm64", "0.2.9", "0.1.0");
    }

    private static DeviceCallContext harness(UUID installationId, long userId) {
        return new DeviceCallContext(
            "000000",
            new PlatformSession(userId, PlatformClient.DSH_DESKTOP, "harness", installationId.toString()),
            "req_01ARZ3NDEKTSV4RRFFQ69G5FAV",
            "127.0.0.1",
            new byte[32]
        );
    }

    private static DeviceCallContext admin() {
        return new DeviceCallContext(
            "000000",
            new PlatformSession(ADMIN_ID, PlatformClient.ENTERPRISE_ADMIN, "admin-web", "admin-session-1"),
            "req_01ARZ3NDEKTSV4RRFFQ69G5FAV",
            "127.0.0.1",
            new byte[32]
        );
    }

    private static final class RecordingSessionGateway implements PlatformSessionGateway {
        private final List<String> revoked = new ArrayList<>();

        @Override
        public IssuedPlatformSession issue(long userId, PlatformClient client, String deviceId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public PlatformSession current() {
            throw new UnsupportedOperationException();
        }

        @Override
        public void logoutCurrent() {
            throw new UnsupportedOperationException();
        }

        @Override
        public void revokeHarnessDevice(long userId, String installationId) {
            revoked.add(userId + ":" + installationId);
        }

        @Override
        public void revokeUser(long userId) {
        }
    }
}
