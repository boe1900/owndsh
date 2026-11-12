/**
 * [INPUT]: 依赖真实 PostgreSQL、Redis、员工安装/Console 登录上下文与 V57 身份公钥字段。
 * [OUTPUT]: 验证本人设备授权、跨来源/跨登录拒绝、并发首次 pin、ticket 单次消费及续租/撤销的原子状态。
 * [POS]: remote/application 跨存储验收，不用 fake 替代数据库所有权或 Redis TTL。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.device.application.DeviceAccessException;
import com.owndsh.enterprise.device.application.DeviceCallContext;
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
import org.redisson.client.codec.StringCodec;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.CountDownLatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class RemoteControlServiceIntegrationTest {
    private static final String TENANT = "tenant-a";
    private static final long OWNER = 2_001_100_000_000_000_003L;
    private static final long OTHER = 2_001_100_000_000_000_004L;
    private static final long HOST = 9_001_001L;
    private static final long SOURCE = 9_001_002L;
    private static final long FOREIGN = 9_001_003L;
    private static final long OTHER_TENANT = 9_001_004L;
    private static final long UNPINNED = 9_001_005L;
    private static final UUID HOST_INSTALL = UUID.fromString("123e4567-e89b-42d3-a456-426614174010");
    private static final UUID SOURCE_INSTALL = UUID.fromString("123e4567-e89b-42d3-a456-426614174011");
    private static final String CONTROLLER = "ctl_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    private static final String HOST_KEY = key((byte) 1);
    private static final String CONTROLLER_KEY = key((byte) 2);
    private static final String LEASE = "lease_01ARZ3NDEKTSV4RR";
    private static final RedissonClient REDIS = RedisTestServer.client();
    private static final JsonMapper JSON = JsonMapper.builder().findAndAddModules().build();

    @AfterAll static void closeRedis() { REDIS.shutdown(); }

    @Test
    void scopesEmployeeDevicesTicketsAndPinsToCurrentOwnerAndInstallation() {
        Fixture f = fixture("remote_owned");
        assertThat(f.service.listOwned(employee(), 0, 100)).extracting(value -> value.deviceId()).containsExactly(HOST, UNPINNED);
        assertThatThrownBy(() -> f.service.createTicket(admin(OTHER), HOST, UUID.randomUUID(), request()))
            .isInstanceOfSatisfying(RemoteControlException.class, e -> assertThat(e.code()).isEqualTo("ENT_PERMISSION_DENIED"));
        assertThatThrownBy(() -> f.service.createEmployeeTicket(employee(), SOURCE, UUID.randomUUID(), request()))
            .isInstanceOf(RemoteControlException.class);
        assertThatThrownBy(() -> f.service.createEmployeeTicket(employee(), FOREIGN, UUID.randomUUID(), request()))
            .isInstanceOf(RemoteControlException.class);
        assertThatThrownBy(() -> f.service.createEmployeeTicket(employee(), OTHER_TENANT, UUID.randomUUID(), request()))
            .isInstanceOf(RemoteControlException.class);
        assertThatThrownBy(() -> f.service.createEmployeeTicket(employee(), UNPINNED, UUID.randomUUID(), request()))
            .isInstanceOfSatisfying(RemoteControlException.class, e -> assertThat(e.code()).isEqualTo("ENT_REMOTE_UNAVAILABLE"));
        assertThat(f.service.authorizePeer(peer(OWNER, HOST_INSTALL), "host", Long.toString(HOST), HOST_KEY)).isTrue();
        assertThat(f.service.authorizePeer(peer(OWNER, HOST_INSTALL), "host", Long.toString(HOST), CONTROLLER_KEY)).isFalse();
        assertThat(f.service.authorizePeer(peer(OTHER, HOST_INSTALL), "host", Long.toString(HOST), HOST_KEY)).isFalse();
        assertThat(f.service.authorizePeer(peer(OWNER, SOURCE_INSTALL), "host", Long.toString(HOST), HOST_KEY)).isFalse();
        assertThat(f.service.authorizePeer(new RemotePeerIdentity(TENANT, OWNER, "console", SOURCE_INSTALL.toString()), "controller", CONTROLLER, CONTROLLER_KEY)).isFalse();
        assertThat(f.store.identityPublicKey(TENANT, HOST)).contains(HOST_KEY);
        assertThat(f.database.jdbc().queryForObject("select identity_key_revision from ent_remote_device_config where device_id = ?", Long.class, HOST)).isEqualTo(1);
        UUID idempotency = UUID.randomUUID();
        var ticket = f.service.createEmployeeTicket(employee(), HOST, idempotency, request());
        assertThat(ticket.hostPublicKey()).isEqualTo(HOST_KEY);
        assertThat(f.service.createEmployeeTicket(employee(), HOST, idempotency, request())).isEqualTo(ticket);
        assertThat(f.service.acquireLease(ticket.linkId(), LEASE, 60)).isEmpty();
        assertThat(f.service.consumeTicket(ticket.ticket(), ticket.linkId(), ticket.deviceId(), CONTROLLER, CONTROLLER_KEY, peer(OTHER, SOURCE_INSTALL))).isEmpty();
        assertThat(f.service.consumeTicket(ticket.ticket(), ticket.linkId(), ticket.deviceId(), CONTROLLER, HOST_KEY, peer(OWNER, SOURCE_INSTALL))).isEmpty();
        assertThat(f.service.consumeTicket(ticket.ticket(), ticket.linkId(), ticket.deviceId(), CONTROLLER, CONTROLLER_KEY, peer(OWNER, HOST_INSTALL))).isEmpty();
        assertThat(f.service.consumeTicket(ticket.ticket(), ticket.linkId(), ticket.deviceId(), CONTROLLER, CONTROLLER_KEY, peer(OWNER, SOURCE_INSTALL))).isPresent();
        assertThat(f.service.consumeTicket(ticket.ticket(), ticket.linkId(), ticket.deviceId(), CONTROLLER, CONTROLLER_KEY, peer(OWNER, SOURCE_INSTALL))).isEmpty();
        assertThat(f.service.acquireLease(ticket.linkId(), LEASE, 60)).isPresent();
        assertThat(f.service.isLeaseActive(ticket.linkId(), LEASE)).isTrue();
        REDIS.getBucket("remote:link:" + ticket.linkId()).expire(Duration.ofSeconds(1));
        REDIS.getBucket("remote:consumed:" + ticket.linkId()).expire(Duration.ofSeconds(1));
        assertThat(f.service.renewLease(ticket.linkId(), LEASE, 60)).isTrue();
        assertThat(REDIS.getBucket("remote:link:" + ticket.linkId()).remainTimeToLive()).isGreaterThan(60_000L);
        assertThat(REDIS.getBucket("remote:consumed:" + ticket.linkId()).remainTimeToLive()).isGreaterThan(60_000L);
        assertThatThrownBy(() -> f.service.revokeLease(admin(OTHER), ticket.linkId())).isInstanceOf(RemoteControlException.class);
        assertThat(f.service.revokeLease(admin(OWNER), ticket.linkId()).epoch()).isEqualTo(1);
        assertThat(f.service.renewLease(ticket.linkId(), LEASE, 60)).isFalse();
        assertThat(f.service.isLeaseActive(ticket.linkId(), LEASE)).isFalse();
        assertThat(f.service.acquireLease(ticket.linkId(), LEASE, 60)).isEmpty();
        f.database.jdbc().update("update ent_device set status = 'REVOKED', revoked_at = now() where id = ?", SOURCE);
        assertThatThrownBy(() -> f.service.listOwned(employee(), 0, 100)).isInstanceOf(DeviceAccessException.class);
    }

    @Test
    void persistsExactlyOneKeyDuringConcurrentFirstUseAndAcrossNewService() throws Exception {
        Fixture f = fixture("remote_pin");
        UUID installation = f.store.find(TENANT, UNPINNED, Instant.now()).orElseThrow().installationId();
        assertThat(f.service.authorizePeer(peer(OWNER, installation), "host", Long.toString(UNPINNED), null)).isTrue();
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> { start.await(); return f.service.authorizePeer(peer(OWNER, installation), "host", Long.toString(UNPINNED), HOST_KEY); });
            var second = executor.submit(() -> { start.await(); return f.service.authorizePeer(peer(OWNER, installation), "host", Long.toString(UNPINNED), CONTROLLER_KEY); });
            start.countDown();
            assertThat(List.of(first.get(), second.get())).containsExactlyInAnyOrder(true, false);
        }
        String pinned = f.store.identityPublicKey(TENANT, UNPINNED).orElseThrow();
        RemoteControlService restarted = service(f.store);
        assertThat(restarted.authorizePeer(peer(OWNER, installation), "host", Long.toString(UNPINNED), pinned)).isTrue();
        assertThat(restarted.authorizePeer(peer(OWNER, installation), "host", Long.toString(UNPINNED), pinned.equals(HOST_KEY) ? CONTROLLER_KEY : HOST_KEY)).isFalse();
        assertThat(f.database.jdbc().queryForObject("select identity_key_revision from ent_remote_device_config where device_id = ?", Long.class, UNPINNED)).isEqualTo(1);
    }

    @Test
    void deviceRevocationAndRemoteDisableFenceExistingLease() {
        Fixture f = fixture("remote_fence");
        var ticket = f.service.createEmployeeTicket(employee(), HOST, UUID.randomUUID(), request());
        assertThat(f.service.consumeTicket(ticket.ticket(), ticket.linkId(), ticket.deviceId(), CONTROLLER, CONTROLLER_KEY, peer(OWNER, SOURCE_INSTALL))).isPresent();
        assertThat(f.service.acquireLease(ticket.linkId(), LEASE, 60)).isPresent();
        f.service.updatePresence(Long.toString(HOST), HOST_KEY, "READY", false, "[\"remote.connect\"]", Instant.MAX.getEpochSecond());
        assertThat(f.service.renewLease(ticket.linkId(), LEASE, 60)).isFalse();
        assertThat(f.service.isLeaseActive(ticket.linkId(), LEASE)).isFalse();
        f.service.updatePresence(Long.toString(HOST), HOST_KEY, "READY", true, "[\"remote.connect\"]", 0);
        assertThat(f.service.get(admin(OWNER), HOST).online()).isTrue();
        f.database.jdbc().update("update ent_device set status = 'REVOKED', revoked_at = now() where id = ?", SOURCE);
        assertThat(f.service.renewLease(ticket.linkId(), LEASE, 60)).isFalse();
        assertThat(f.service.isLeaseActive(ticket.linkId(), LEASE)).isFalse();
        assertThat(f.service.authorizePeer(peer(OWNER, SOURCE_INSTALL), "controller", CONTROLLER, CONTROLLER_KEY)).isFalse();
    }

    @Test
    void revokedUnconsumedTicketCannotBeConsumedAndExpiredLeaseCannotReturn() throws InterruptedException {
        Fixture f = fixture("remote_expire");
        var ticket = f.service.createEmployeeTicket(employee(), HOST, UUID.randomUUID(), request());
        f.service.revokeLease(admin(OWNER), ticket.linkId());
        assertThat(f.service.consumeTicket(ticket.ticket(), ticket.linkId(), ticket.deviceId(), CONTROLLER, CONTROLLER_KEY, peer(OWNER, SOURCE_INSTALL))).isEmpty();
        var active = f.service.createEmployeeTicket(employee(), HOST, UUID.randomUUID(), request());
        f.service.consumeTicket(active.ticket(), active.linkId(), active.deviceId(), CONTROLLER, CONTROLLER_KEY, peer(OWNER, SOURCE_INSTALL));
        assertThat(f.service.acquireLease(active.linkId(), LEASE, 1)).isPresent();
        REDIS.getBucket("remote:lease:" + active.linkId(), StringCodec.INSTANCE).expire(Duration.ofMillis(1));
        Thread.sleep(10);
        assertThat(f.service.isLeaseActive(active.linkId(), LEASE)).isFalse();
        assertThat(f.service.renewLease(active.linkId(), LEASE, 60)).isFalse();
        assertThat(f.service.acquireLease(active.linkId(), LEASE, 60)).isEmpty();
    }

    @Test
    void pinnedKeyMustMatchCurrentAuthenticatedReadyHost() {
        Fixture f = fixture("remote_live_key");
        f.service.updatePresence(Long.toString(HOST), null, "READY", true, "[\"remote.connect\"]", 0);
        assertThatThrownBy(() -> f.service.createEmployeeTicket(employee(), HOST, UUID.randomUUID(), request()))
            .isInstanceOfSatisfying(RemoteControlException.class, e -> assertThat(e.code()).isEqualTo("ENT_REMOTE_UNAVAILABLE"));
        f.service.updatePresence(Long.toString(HOST), HOST_KEY, "READY", true, "[\"remote.connect\"]", 0);
        assertThat(f.service.createEmployeeTicket(employee(), HOST, UUID.randomUUID(), request()).hostPublicKey()).isEqualTo(HOST_KEY);
        f.service.removePresence(Long.toString(HOST));
        assertThatThrownBy(() -> f.service.createEmployeeTicket(employee(), HOST, UUID.randomUUID(), request())).isInstanceOf(RemoteControlException.class);
    }

    @Test
    void consoleControlsOnlyOwnedHostsAndBindsTicketToOneBrowserLogin() {
        Fixture f = fixture("remote_console");
        String sessionId = "admin-" + UUID.randomUUID();
        PlatformSession browser = console(OWNER, sessionId);
        RemotePeerIdentity controller = new RemotePeerIdentity(TENANT, OWNER, "console", sessionId);
        assertThat(f.service.listConsoleOwned(admin(OWNER), browser, 0, 100)).extracting(value -> value.deviceId())
            .containsExactly(HOST, SOURCE, UNPINNED);
        assertThat(f.service.authorizePeer(controller, "controller", CONTROLLER, CONTROLLER_KEY)).isTrue();
        assertThat(f.service.authorizePeer(controller, "host", Long.toString(HOST), HOST_KEY)).isFalse();
        assertThat(f.service.isPeerActive(controller, "host", Long.toString(HOST), HOST_KEY)).isFalse();
        assertThatThrownBy(() -> f.service.createConsoleTicket(admin(OWNER), browser, FOREIGN, UUID.randomUUID(), request()))
            .isInstanceOfSatisfying(RemoteControlException.class, e -> assertThat(e.code()).isEqualTo("ENT_PERMISSION_DENIED"));
        assertThatThrownBy(() -> f.service.createConsoleTicket(admin(OWNER), browser, OTHER_TENANT, UUID.randomUUID(), request()))
            .isInstanceOf(RemoteControlException.class);
        UUID idempotency = UUID.randomUUID();
        var ticket = f.service.createConsoleTicket(admin(OWNER), browser, HOST, idempotency, request());
        assertThat(ticket.hostPublicKey()).isEqualTo(HOST_KEY);
        assertThat(f.service.createConsoleTicket(admin(OWNER), browser, HOST, idempotency, request())).isEqualTo(ticket);
        assertThatThrownBy(() -> f.service.createConsoleTicket(admin(OWNER), console(OWNER, "admin-" + UUID.randomUUID()), HOST, idempotency, request()))
            .isInstanceOfSatisfying(RemoteControlException.class, e -> assertThat(e.code()).isEqualTo("ENT_IDEMPOTENCY_CONFLICT"));
        assertThat(f.service.consumeTicket(ticket.ticket(), ticket.linkId(), ticket.deviceId(), CONTROLLER, CONTROLLER_KEY,
            new RemotePeerIdentity(TENANT, OWNER, "console", "admin-" + UUID.randomUUID()))).isEmpty();
        assertThat(f.service.consumeTicket(ticket.ticket(), ticket.linkId(), ticket.deviceId(), CONTROLLER, CONTROLLER_KEY,
            new RemotePeerIdentity(TENANT, OTHER, "console", sessionId))).isEmpty();
        assertThat(f.service.consumeTicket(ticket.ticket(), ticket.linkId(), ticket.deviceId(), CONTROLLER, CONTROLLER_KEY,
            peer(OWNER, SOURCE_INSTALL))).isEmpty();
        var bound = f.service.consumeTicket(ticket.ticket(), ticket.linkId(), ticket.deviceId(), CONTROLLER, CONTROLLER_KEY, controller).orElseThrow();
        assertThat(bound.controllerKind()).isEqualTo(com.owndsh.enterprise.remote.domain.RemoteTicketState.ControllerKind.CONSOLE);
        assertThat(bound.controllerSessionId()).isEqualTo(sessionId);
        assertThat(bound.controllerInstallationId()).isNull();
        assertThat(f.service.acquireLease(ticket.linkId(), LEASE, 60)).isPresent();
        assertThat(f.service.renewLease(ticket.linkId(), LEASE, 60)).isTrue();
        f.database.jdbc().update("update ent_device set user_id = ? where id = ?", OTHER, HOST);
        assertThat(f.service.isLeaseActive(ticket.linkId(), LEASE)).isFalse();
    }

    @Test
    void consoleCannotConsumeHarnessTicketOrRetainLeaseAfterHostCapabilityOrPinChanges() {
        Fixture f = fixture("remote_console_fence");
        String sessionId = "admin-" + UUID.randomUUID();
        RemotePeerIdentity controller = new RemotePeerIdentity(TENANT, OWNER, "console", sessionId);
        var harness = f.service.createTicket(admin(OWNER), HOST, UUID.randomUUID(), request());
        assertThat(f.service.consumeTicket(harness.ticket(), harness.linkId(), harness.deviceId(), CONTROLLER, CONTROLLER_KEY, controller)).isEmpty();
        assertThat(f.service.consumeTicket(harness.ticket(), harness.linkId(), harness.deviceId(), CONTROLLER, CONTROLLER_KEY, peer(OWNER, SOURCE_INSTALL))).isPresent();
        var ticket = f.service.createConsoleTicket(admin(OWNER), console(OWNER, sessionId), HOST, UUID.randomUUID(), request());
        assertThat(f.service.consumeTicket(ticket.ticket(), ticket.linkId(), ticket.deviceId(), CONTROLLER, CONTROLLER_KEY, controller)).isPresent();
        assertThat(f.service.acquireLease(ticket.linkId(), LEASE, 60)).isPresent();
        f.service.updatePresence(Long.toString(HOST), HOST_KEY, "READY", true, "[]", 0);
        assertThat(f.service.isLeaseActive(ticket.linkId(), LEASE)).isFalse();
        f.service.updatePresence(Long.toString(HOST), HOST_KEY, "READY", true, "[\"remote.connect\"]", 0);
        assertThat(f.service.isLeaseActive(ticket.linkId(), LEASE)).isTrue();
        f.database.jdbc().update("update ent_remote_device_config set identity_public_key = ? where device_id = ?",
            Base64.getUrlDecoder().decode(CONTROLLER_KEY), HOST);
        assertThat(f.service.isLeaseActive(ticket.linkId(), LEASE)).isFalse();
    }

    @Test
    void consoleOwnerGuardAndGatewayRevocationUseDurableFacts() {
        Fixture f = fixture("remote_console_disconnect");
        String sessionId = "admin-" + UUID.randomUUID();
        PlatformSession browser = console(OWNER, sessionId);
        f.service.requireConsoleOwner(admin(OWNER), browser, HOST);
        assertThatThrownBy(() -> f.service.requireConsoleOwner(admin(OWNER), browser, FOREIGN))
            .isInstanceOfSatisfying(RemoteControlException.class, error -> assertThat(error.code()).isEqualTo("ENT_PERMISSION_DENIED"));
        assertThatThrownBy(() -> f.service.requireConsoleOwner(admin(OWNER), browser, OTHER_TENANT))
            .isInstanceOfSatisfying(RemoteControlException.class, error -> assertThat(error.code()).isEqualTo("ENT_RESOURCE_NOT_FOUND"));
        var ticket = f.service.createConsoleTicket(admin(OWNER), browser, HOST, UUID.randomUUID(), request());
        var controller = new RemotePeerIdentity(TENANT, OWNER, "console", sessionId);
        assertThat(f.service.consumeTicket(ticket.ticket(), ticket.linkId(), ticket.deviceId(), CONTROLLER, CONTROLLER_KEY, controller)).isPresent();
        assertThat(f.service.acquireLease(ticket.linkId(), LEASE, 60)).isPresent();
        new RemoteControlGatewayAuthorizer(f.service).revokeLink(ticket.linkId());
        assertThat(f.service.isLinkActive(ticket.linkId())).isFalse();
        assertThat(f.service.isLeaseActive(ticket.linkId(), LEASE)).isFalse();
        assertThat(f.service.renewLease(ticket.linkId(), LEASE, 60)).isFalse();
        assertThat(f.service.isPeerActive(peer(OWNER, HOST_INSTALL), "host", Long.toString(HOST), HOST_KEY)).isTrue();
    }

    private static Fixture fixture(String label) {
        var db = PostgresTestDatabase.create(label);
        PostgresTestDatabase.migrate(db, null);
        PostgresTestDatabase.insertActiveUser(db, OWNER, 1_761_000_000_000_000_103L, "remote-a", "Remote A");
        PostgresTestDatabase.insertActiveUser(db, OTHER, 1_761_000_000_000_000_103L, "remote-b", "Remote B");
        insert(db, TENANT, OWNER, HOST, HOST_INSTALL);
        insert(db, TENANT, OWNER, SOURCE, SOURCE_INSTALL);
        insert(db, TENANT, OTHER, FOREIGN, UUID.randomUUID());
        insert(db, "tenant-b", OWNER, OTHER_TENANT, UUID.randomUUID());
        insert(db, TENANT, OWNER, UNPINNED, UUID.randomUUID());
        JdbcRemoteDeviceStore store = new JdbcRemoteDeviceStore(db.jdbc(), JSON);
        RemoteControlService service = service(store);
        assertThat(service.authorizePeer(peer(OWNER, HOST_INSTALL), "host", Long.toString(HOST), HOST_KEY)).isTrue();
        service.updatePresence(Long.toString(HOST), HOST_KEY, "READY", true, "[\"remote.connect\"]", 0);
        return new Fixture(db, store, service);
    }

    private static RemoteControlService service(JdbcRemoteDeviceStore store) {
        return new RemoteControlService(store, new RemoteRedisStateStore(REDIS), JSON, new RemoteNettyProperties());
    }

    private static void insert(PostgresTestDatabase.Database db, String tenant, long owner, long device, UUID installation) {
        db.jdbc().update("""
            insert into ent_device(id, tenant_id, user_id, installation_id, name, platform, harness_version, bundle_version,
                status, last_seen_at, revoked_at, revision)
            values (?, ?, ?, ?, 'Test Host', 'linux-amd64', '0.2.1-rc.5', '0.1.0', 'ACTIVE', ?, null, 0)
            """, device, tenant, owner, installation, Timestamp.from(Instant.now()));
        db.jdbc().update("""
            insert into ent_remote_device_config(device_id, tenant_id, remote_enabled, presence_state, capability_snapshot, last_presence_at)
            values (?, ?, true, 'READY', '{"capabilities":["remote.connect"],"transports":["relay"]}'::jsonb, ?)
            """, device, tenant, Timestamp.from(Instant.now()));
    }

    private static DeviceCallContext employee() {
        return new DeviceCallContext(TENANT, new PlatformSession(OWNER, PlatformClient.DSH_DESKTOP, "harness", SOURCE_INSTALL.toString()), "req_remote_01", "127.0.0.1", new byte[32]);
    }
    private static EnterpriseRequestContext admin(long actor) { return new EnterpriseRequestContext(TENANT, actor, "req_remote_01", "127.0.0.1", new byte[32]); }
    private static PlatformSession console(long actor, String sessionId) { return new PlatformSession(actor, PlatformClient.ENTERPRISE_ADMIN, "console", sessionId); }
    private static RemotePeerIdentity peer(long actor, UUID installation) { return new RemotePeerIdentity(TENANT, actor, "harness", installation.toString()); }
    private static RemoteTicketRequest request() { return new RemoteTicketRequest(CONTROLLER, CONTROLLER_KEY, List.of("remote.connect"), "plugin/0.1.0"); }
    private static String key(byte value) {
        byte[] bytes = new byte[32]; Arrays.fill(bytes, value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    private record Fixture(PostgresTestDatabase.Database database, JdbcRemoteDeviceStore store, RemoteControlService service) {}
}
