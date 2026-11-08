/**
 * [INPUT]: 依赖真实 Redis/PostgreSQL、RemoteControlService、JdbcRemoteDeviceStore 与 V57 schema。
 * [OUTPUT]: 验证 ticket 绑定消费、两租户隔离、lease/revoke fencing 和 presence TTL 的可观察行为。
 * [POS]: remote/application 的跨存储验收；不替换 Redis Lua 或 PostgreSQL 设备事实为 fake。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.remote.application.RemoteControlService;
import com.owndsh.enterprise.remote.application.RemoteTicketRequest;
import com.owndsh.enterprise.remote.persistence.JdbcRemoteDeviceStore;
import com.owndsh.enterprise.remote.domain.RemoteControlException;
import com.owndsh.enterprise.test.PostgresTestDatabase;
import com.owndsh.enterprise.test.RedisTestServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.redisson.api.RedissonClient;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class RemoteControlServiceIntegrationTest {
    private static final String TENANT_A = "tenant-a";
    private static final String TENANT_B = "tenant-b";
    private static final long USER_A = 2_001_100_000_000_000_003L;
    private static final long USER_B = 2_001_100_000_000_000_004L;
    private static final long DEVICE_A = 9_001_001L;
    private static final long DEVICE_B = 9_001_002L;
    private static final UUID INSTALLATION_A = UUID.fromString("123e4567-e89b-42d3-a456-426614174010");
    private static final UUID INSTALLATION_B = UUID.fromString("123e4567-e89b-42d3-a456-426614174011");
    private static final Instant NOW = Instant.now();
    private static final String CONTROLLER_A = "ctl_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    private static final String CONTROLLER_B = "ctl_01ARZ3NDEKTSV4RRFFQ69G5FAW";
    private static final String KEY_A = key((byte) 1);
    private static final String KEY_B = key((byte) 2);
    private static final RedissonClient REDIS = RedisTestServer.client();

    @AfterAll
    static void closeRedis() {
        REDIS.shutdown();
    }

    @Test
    void keepsTicketLeaseAndPresenceFactsBoundToTheOwningAccount() {
        var database = PostgresTestDatabase.create("remote_core");
        PostgresTestDatabase.migrate(database, null);
        PostgresTestDatabase.insertActiveUser(database, USER_A, 1_761_000_000_000_000_103L, "remote-a", "Remote A");
        PostgresTestDatabase.insertActiveUser(database, USER_B, 1_761_000_000_000_000_103L, "remote-b", "Remote B");
        insertDevice(database, TENANT_A, USER_A, DEVICE_A, INSTALLATION_A, "Host A");
        insertDevice(database, TENANT_B, USER_B, DEVICE_B, INSTALLATION_B, "Host B");

        RemoteNettyProperties properties = new RemoteNettyProperties();
        JsonMapper json = JsonMapper.builder().findAndAddModules().build();
        RemoteControlService service = new RemoteControlService(
            new JdbcRemoteDeviceStore(database.jdbc(), json),
            new RemoteRedisStateStore(REDIS),
            json,
            properties
        );
        EnterpriseRequestContext accountA = context(TENANT_A, USER_A);
        EnterpriseRequestContext accountB = context(TENANT_B, USER_B);
        RemoteTicketRequest requestA = request(CONTROLLER_A, KEY_A);

        service.updatePresence(Long.toString(DEVICE_A), "READY", true, "[\"remote.connect\"]", NOW.toEpochMilli());
        assertThat(service.get(accountA, DEVICE_A).online()).isTrue();
        service.updatePresence(Long.toString(DEVICE_A), "READY", false, "[\"remote.connect\"]", NOW.toEpochMilli());
        assertThat(service.get(accountA, DEVICE_A).remoteEnabled()).isFalse();
        assertThat(service.get(accountA, DEVICE_A).online()).isFalse();
        assertThatThrownBy(() -> service.createTicket(accountA, DEVICE_A, UUID.randomUUID(), requestA))
            .isInstanceOfSatisfying(RemoteControlException.class, exception -> assertThat(exception.code()).isEqualTo("ENT_REMOTE_DISABLED"));
        assertThat(service.authorizePeer(
            new RemotePeerIdentity(TENANT_A, USER_A, "dsh-desktop", INSTALLATION_A.toString()),
            "host", Long.toString(DEVICE_A), null
        )).isTrue();
        service.updatePresence(Long.toString(DEVICE_A), "READY", true, "[\"remote.connect\"]", NOW.toEpochMilli());
        var ticket = service.createTicket(accountA, DEVICE_A, UUID.randomUUID(), requestA);

        assertThat(service.consumeTicket(
            ticket.ticket(), ticket.linkId(), ticket.deviceId(), CONTROLLER_A, KEY_A,
            new RemotePeerIdentity(TENANT_B, USER_B, "browser", "console")
        )).isEmpty();
        assertThat(service.consumeTicket(
            ticket.ticket(), ticket.linkId(), ticket.deviceId(), CONTROLLER_A, KEY_A,
            new RemotePeerIdentity(TENANT_A, USER_A, "browser", "console")
        )).isPresent();
        assertThat(service.consumeTicket(
            ticket.ticket(), ticket.linkId(), ticket.deviceId(), CONTROLLER_A, KEY_A,
            new RemotePeerIdentity(TENANT_A, USER_A, "browser", "console")
        )).isEmpty();

        var second = service.createTicket(accountA, DEVICE_A, UUID.randomUUID(), requestA);
        assertThat(service.acquireLease(second.linkId(), "lease_01ARZ3NDEKTSV4RR", 60)).isPresent();
        assertThat(service.renewLease(second.linkId(), "lease_01ARZ3NDEKTSV4RR", 60)).isTrue();
        assertThatThrownBy(() -> service.revokeLease(accountB, second.linkId()))
            .isInstanceOfSatisfying(RemoteControlException.class, exception -> assertThat(exception.code()).isEqualTo("ENT_PERMISSION_DENIED"));
        assertThat(service.revokeLease(accountA, second.linkId()).epoch()).isEqualTo(1);
        assertThat(service.renewLease(second.linkId(), "lease_01ARZ3NDEKTSV4RR", 60)).isFalse();

        assertThatThrownBy(() -> service.createTicket(accountB, DEVICE_A, UUID.randomUUID(), request(CONTROLLER_B, KEY_B)))
            .isInstanceOfSatisfying(RemoteControlException.class, exception -> assertThat(exception.code()).isEqualTo("ENT_RESOURCE_NOT_FOUND"));
    }

    private static void insertDevice(
        PostgresTestDatabase.Database database,
        String tenant,
        long userId,
        long deviceId,
        UUID installation,
        String name
    ) {
        database.jdbc().update("""
            insert into ent_device(
                id, tenant_id, user_id, installation_id, name, platform, harness_version, bundle_version,
                status, last_seen_at, revoked_at, revision
            ) values (?, ?, ?, ?, ?, 'linux-amd64', '0.2.1-rc.5', '0.1.0', 'ACTIVE', ?, null, 0)
            """, deviceId, tenant, userId, installation, name, Timestamp.from(NOW));
        database.jdbc().update("""
            insert into ent_remote_device_config(
                device_id, tenant_id, remote_enabled, presence_state, capability_snapshot, last_presence_at
            ) values (?, ?, true, 'READY', '{"capabilities":["remote.connect"],"transports":["relay"]}'::jsonb, ?)
            """, deviceId, tenant, Timestamp.from(NOW));
    }

    private static EnterpriseRequestContext context(String tenant, long actorId) {
        return new EnterpriseRequestContext(tenant, actorId, "req_remote_01", "127.0.0.1", new byte[32]);
    }

    private static RemoteTicketRequest request(String controllerId, String publicKey) {
        return new RemoteTicketRequest(controllerId, publicKey, List.of("remote.connect"), "console/0.1.0");
    }

    private static String key(byte value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[32]).replace("A", value == 1 ? "B" : "C");
    }
}
