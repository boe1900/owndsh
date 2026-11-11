/**
 * [INPUT]: 依赖可信员工/管理员上下文、RemoteDeviceStore、Redis ticket/link 状态、JsonMapper 和 coturn 配置。
 * [OUTPUT]: 提供设备列表、能力读取、一次性 ticket 签发与当前所有权/安装状态绑定的 lease，Host 公钥仅从已认证数据库 pin 读取。
 * [POS]: remote/application 的唯一控制面编排；Controller 不直接拼 SQL、Redis key 或加密凭据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote.application;

import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.device.application.DeviceAccessException;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.domain.DeviceStatus;
import com.owndsh.enterprise.remote.domain.EmployeeRemoteTicket;
import com.owndsh.enterprise.remote.RemoteNettyProperties;
import com.owndsh.enterprise.remote.RemoteProtocol;
import com.owndsh.enterprise.remote.RemotePeerIdentity;
import com.owndsh.enterprise.remote.RemoteRedisStateStore;
import com.owndsh.enterprise.remote.domain.RemoteControlException;
import com.owndsh.enterprise.remote.domain.RemoteDeviceSnapshot;
import com.owndsh.enterprise.remote.domain.RemoteTicket;
import com.owndsh.enterprise.remote.domain.RemoteTicketState;
import com.owndsh.enterprise.remote.persistence.RemoteDeviceStore;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.Optional;

public final class RemoteControlService {
    private static final Duration TICKET_TTL = Duration.ofSeconds(10);
    private static final Duration LINK_TTL = Duration.ofSeconds(90);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final RemoteDeviceStore devices;
    private final RemoteRedisStateStore redis;
    private final JsonMapper json;
    private final RemoteNettyProperties properties;
    private final Clock clock;

    public RemoteControlService(
        RemoteDeviceStore devices,
        RemoteRedisStateStore redis,
        JsonMapper json,
        RemoteNettyProperties properties
    ) {
        this(devices, redis, json, properties, Clock.systemUTC());
    }

    RemoteControlService(
        RemoteDeviceStore devices,
        RemoteRedisStateStore redis,
        JsonMapper json,
        RemoteNettyProperties properties,
        Clock clock
    ) {
        this.devices = Objects.requireNonNull(devices, "devices");
        this.redis = Objects.requireNonNull(redis, "redis");
        this.json = Objects.requireNonNull(json, "json");
        this.properties = Objects.requireNonNull(properties, "properties");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public List<RemoteDeviceSnapshot> list(EnterpriseRequestContext context, long afterId, int limit) {
        return devices.list(context.tenantId(), afterId, limit, clock.instant());
    }

    public RemoteDeviceSnapshot get(EnterpriseRequestContext context, long deviceId) {
        return devices.find(context.tenantId(), deviceId, clock.instant())
            .orElseThrow(() -> new RemoteControlException("ENT_RESOURCE_NOT_FOUND"));
    }

    public RemoteDeviceSnapshot requireEmployee(DeviceCallContext context) {
        var session = context.session();
        if (session.client() != PlatformClient.DSH_DESKTOP || !"harness".equals(session.deviceType())) {
            throw new DeviceAccessException("ENT_PERMISSION_DENIED");
        }
        RemoteDeviceSnapshot device = installation(context.tenantId(), session.userId(), session.deviceId());
        if (device == null) throw new DeviceAccessException("ENT_DEVICE_REVOKED");
        return device;
    }

    public List<RemoteDeviceSnapshot> listOwned(DeviceCallContext context, long afterId, int limit) {
        RemoteDeviceSnapshot source = requireEmployee(context);
        return devices.listOwned(context.tenantId(), source.userId(), source.installationId(), afterId, limit, clock.instant());
    }

    public EmployeeRemoteTicket createEmployeeTicket(DeviceCallContext context, long deviceId, UUID idempotencyKey, RemoteTicketRequest request) {
        RemoteDeviceSnapshot source = requireEmployee(context);
        if (source.deviceId() == deviceId) throw new RemoteControlException("ENT_PERMISSION_DENIED");
        EnterpriseRequestContext actor = new EnterpriseRequestContext(context.tenantId(), source.userId(), context.requestId(), context.sourceIp(), context.userAgentHash());
        RemoteTicket ticket = createTicket(actor, deviceId, idempotencyKey, request, source.installationId().toString());
        return EmployeeRemoteTicket.from(ticket, devices.identityPublicKey(context.tenantId(), deviceId).orElseThrow());
    }

    public RemoteTicket createTicket(EnterpriseRequestContext context, long deviceId, UUID idempotencyKey, RemoteTicketRequest request) {
        return createTicket(context, deviceId, idempotencyKey, request, null);
    }

    private RemoteTicket createTicket(
        EnterpriseRequestContext context,
        long deviceId,
        UUID idempotencyKey,
        RemoteTicketRequest request,
        String controllerInstallationId
    ) {
        RemoteDeviceSnapshot device = get(context, deviceId);
        if (device.userId() != context.actorId()) throw new RemoteControlException("ENT_PERMISSION_DENIED");
        Instant now = clock.instant();
        if (device.status() == DeviceStatus.REVOKED) throw new RemoteControlException("ENT_DEVICE_REVOKED");
        if (!device.remoteEnabled()) throw new RemoteControlException("ENT_REMOTE_DISABLED");
        if (!device.connectable(now)) throw new RemoteControlException("ENT_REMOTE_UNAVAILABLE");
        if (request.requestedCapabilities().stream().anyMatch(capability -> !device.capabilities().contains(capability))) {
            throw new RemoteControlException("ENT_REMOTE_FEATURE_NOT_SUPPORTED");
        }

        String hostPublicKey = devices.identityPublicKey(context.tenantId(), deviceId)
            .filter(RemoteProtocol::isPublicKey).filter(key -> activeHostKey(Long.toString(deviceId), key))
            .orElseThrow(() -> new RemoteControlException("ENT_REMOTE_UNAVAILABLE"));
        String linkId = RemoteIds.ulid("rln_");
        String ticket = randomToken();
        Instant expiresAt = now.plus(TICKET_TTL);
        RemoteTicket response = new RemoteTicket(ticket, linkId, Long.toString(device.deviceId()), expiresAt, iceServers(linkId, expiresAt));
        RemoteTicketState state = new RemoteTicketState(
            context.tenantId(), context.actorId(), Long.toString(device.deviceId()), linkId,
            request.controllerDeviceId(), request.controllerPublicKey(), controllerInstallationId, hostPublicKey, request.requestedCapabilities(), expiresAt
        );
        String fingerprint = fingerprint(deviceId, request) + ":" + controllerInstallationId;
        String idempotencyState = write(new RemoteIdempotencyState(fingerprint, response));
        String result = redis.issueTicket(
            "remote:ticket:" + digest(ticket),
            "remote:link:" + linkId,
            "remote:ticket-idem:" + context.tenantId() + ":" + context.actorId() + ":" + idempotencyKey,
            writeTicketState(state),
            idempotencyState,
            LINK_TTL
        );
        RemoteIdempotencyState existing = read(result, RemoteIdempotencyState.class);
        if (!fingerprint.equals(existing.fingerprint())) throw new RemoteControlException("ENT_IDEMPOTENCY_CONFLICT");
        return existing.ticket();
    }

    public RemoteLeaseResult revokeLease(EnterpriseRequestContext context, String linkId) {
        if (!RemoteProtocol.LINK_ID.matcher(linkId).matches()) throw new IllegalArgumentException("linkId 格式非法");
        RemoteTicketState state = redis.read("remote:link:" + linkId)
            .map(value -> read(value, RemoteTicketState.class))
            .orElseThrow(() -> new RemoteControlException("ENT_REMOTE_LINK_NOT_FOUND"));
        if (!context.tenantId().equals(state.tenantId()) || context.actorId() != state.actorId()) {
            throw new RemoteControlException("ENT_PERMISSION_DENIED");
        }
        long epoch = redis.revokeLink(linkId);
        return new RemoteLeaseResult(linkId, "lease_" + linkId.substring(4), clock.instant(), epoch);
    }

    public boolean authorizePeer(RemotePeerIdentity identity, String role, String peerId, String publicKey) {
        if (identity == null || !"harness".equals(identity.deviceType())) return false;
        RemoteDeviceSnapshot source = installation(identity.tenantId(), identity.actorId(), identity.deviceId());
        if (source == null) return false;
        if ("controller".equals(role)) {
            return RemoteProtocol.CONTROLLER_ID.matcher(peerId).matches() && RemoteProtocol.isPublicKey(publicKey);
        }
        if (!"host".equals(role) || !Long.toString(source.deviceId()).equals(peerId)) return false;
        return publicKey == null || RemoteProtocol.isPublicKey(publicKey)
            && devices.pinIdentityPublicKey(source.tenantId(), source.userId(), source.installationId(), source.deviceId(), publicKey);
    }

    public boolean isPeerActive(RemotePeerIdentity identity, String role, String peerId, String publicKey) {
        if (identity == null || !"harness".equals(identity.deviceType())) return false;
        RemoteDeviceSnapshot source = installation(identity.tenantId(), identity.actorId(), identity.deviceId());
        if (source == null) return false;
        if ("controller".equals(role)) return RemoteProtocol.CONTROLLER_ID.matcher(peerId).matches() && RemoteProtocol.isPublicKey(publicKey);
        return "host".equals(role) && Long.toString(source.deviceId()).equals(peerId)
            && (publicKey == null || devices.identityPublicKey(source.tenantId(), source.deviceId()).filter(publicKey::equals).isPresent());
    }

    public Optional<RemoteTicketState> consumeTicket(
        String ticket, String linkId, String deviceId, String controllerId,
        String controllerPublicKey, RemotePeerIdentity identity
    ) {
        if (!validConsumeInput(ticket, linkId, deviceId, controllerId, controllerPublicKey)
            || !authorizePeer(identity, "controller", controllerId, controllerPublicKey)) return Optional.empty();
        Optional<String> raw = redis.read("remote:ticket:" + digest(ticket));
        if (raw.isEmpty()) return Optional.empty();
        RemoteTicketState state = read(raw.get(), RemoteTicketState.class);
        if (!matches(state, linkId, deviceId, controllerId, controllerPublicKey)
            || !state.tenantId().equals(identity.tenantId()) || state.actorId() != identity.actorId()
            || !state.expiresAt().isAfter(clock.instant())
            || state.controllerInstallationId() != null && !state.controllerInstallationId().equals(identity.deviceId())) return Optional.empty();
        RemoteTicketState bound = new RemoteTicketState(state.tenantId(), state.actorId(), state.deviceId(), state.linkId(),
            state.controllerDeviceId(), state.controllerPublicKey(), identity.deviceId(), state.hostPublicKey(), state.requestedCapabilities(), state.expiresAt());
        if (!authorizedDevices(bound)) return Optional.empty();
        return redis.consumeTicket("remote:ticket:" + digest(ticket), linkId, raw.get(), writeTicketState(bound))
            ? Optional.of(bound) : Optional.empty();
    }

    public Optional<Instant> acquireLease(String linkId, String leaseId, int ttlSeconds) {
        if (!validLeaseInput(linkId, leaseId, ttlSeconds)) return Optional.empty();
        Optional<String> raw = activeLink(linkId);
        if (raw.isEmpty() || !read(raw.get(), RemoteTicketState.class).expiresAt().isAfter(clock.instant())) return Optional.empty();
        Instant expiresAt = clock.instant().plusSeconds(ttlSeconds);
        return redis.acquireLease(linkId, leaseId, raw.get(), ttlSeconds * 1000L) ? Optional.of(expiresAt) : Optional.empty();
    }

    public boolean renewLease(String linkId, String leaseId, int ttlSeconds) {
        if (!validLeaseInput(linkId, leaseId, ttlSeconds)) return false;
        return activeLink(linkId).filter(raw -> redis.renewLease(linkId, leaseId, raw, ttlSeconds * 1000L)).isPresent();
    }

    public boolean isLinkActive(String linkId) {
        return activeLink(linkId).isPresent();
    }

    public boolean isLeaseActive(String linkId, String leaseId) {
        return isLinkActive(linkId) && redis.read("remote:lease:" + linkId).filter(leaseId::equals).isPresent();
    }

    public void releaseLease(String linkId, String leaseId) {
        if (validLeaseInput(linkId, leaseId, 1)) redis.releaseLease(linkId, leaseId);
    }

    private Optional<String> activeLink(String linkId) {
        if (!RemoteProtocol.LINK_ID.matcher(linkId).matches() || redis.read("remote:consumed:" + linkId).isEmpty()) return Optional.empty();
        return redis.read("remote:link:" + linkId).filter(raw -> authorizedDevices(read(raw, RemoteTicketState.class)));
    }

    private boolean authorizedDevices(RemoteTicketState state) {
        RemoteDeviceSnapshot source = installation(state.tenantId(), state.actorId(), state.controllerInstallationId());
        if (source == null) return false;
        RemoteDeviceSnapshot target = devices.find(state.tenantId(), Long.parseLong(state.deviceId()), clock.instant()).orElse(null);
        return target != null && target.userId() == state.actorId() && target.deviceId() != source.deviceId()
            && target.connectable(clock.instant()) && target.capabilities().containsAll(state.requestedCapabilities())
            && RemoteProtocol.isPublicKey(state.hostPublicKey())
            && devices.identityPublicKey(state.tenantId(), target.deviceId()).filter(state.hostPublicKey()::equals).isPresent()
            && activeHostKey(state.deviceId(), state.hostPublicKey());
    }

    private RemoteDeviceSnapshot installation(String tenantId, long userId, String installationId) {
        if (installationId == null) return null;
        try {
            UUID installation = UUID.fromString(installationId);
            if (installation.version() != 4) return null;
            return devices.findByInstallation(tenantId, installation, clock.instant())
                .filter(device -> device.userId() == userId && device.status() == DeviceStatus.ACTIVE).orElse(null);
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    public void updatePresence(String deviceId, String publicKey, String state, boolean remoteEnabled, String capabilities, long lastSeenAt) {
        long id;
        try {
            id = Long.parseLong(deviceId);
        } catch (NumberFormatException exception) {
            return;
        }
        RemoteDeviceSnapshot device = devices.findByDeviceId(id, clock.instant()).orElse(null);
        if (device == null) return;
        List<String> values = new ArrayList<>();
        try {
            var node = json.readTree(capabilities);
            if (node.isArray()) for (var value : node) if (value.isTextual() && RemoteProtocol.CAPABILITIES.contains(value.asText())) values.add(value.asText());
        } catch (RuntimeException ignored) {
            return;
        }
        devices.updatePresence(device.tenantId(), id, state, remoteEnabled, values, List.of("relay"), clock.instant());
        ObjectNode presence = json.createObjectNode().put("state", state).put("remoteEnabled", remoteEnabled);
        if (publicKey != null) presence.put("hostPublicKey", publicKey);
        redis.updatePresence("remote:presence:" + deviceId, presence.toString(), RemoteProtocol.PRESENCE_TTL_SECONDS * 1000L);
    }

    public void removePresence(String deviceId) {
        redis.removePresence(deviceId);
    }

    private boolean activeHostKey(String deviceId, String key) {
        return redis.read("remote:presence:" + deviceId).map(json::readTree)
            .filter(presence -> "READY".equals(presence.path("state").asText()) && presence.path("remoteEnabled").asBoolean()
                && key.equals(presence.path("hostPublicKey").asText())).isPresent();
    }

    private List<RemoteTicket.IceServer> iceServers(String linkId, Instant expiresAt) {
        List<String> urls = properties.getIceServerUrls();
        if (urls.isEmpty()) return List.of();
        boolean turn = urls.stream().anyMatch(url -> url.startsWith("turn:" ) || url.startsWith("turns:"));
        if (turn && properties.getTurnSharedSecret().isBlank()) throw new RemoteControlException("ENT_REMOTE_TURN_NOT_CONFIGURED");
        String username = null;
        String credential = null;
        if (turn) {
            username = Long.toString(expiresAt.plusSeconds(properties.getTurnCredentialTtlSeconds()).getEpochSecond()) + ":" + linkId;
            credential = hmac(username, properties.getTurnSharedSecret());
        }
        return List.of(new RemoteTicket.IceServer(urls, username, credential));
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("Remote 状态序列化失败", exception);
        }
    }

    private String writeTicketState(RemoteTicketState state) {
        try {
            ObjectNode object = json.valueToTree(state);
            object.put("actorId", Long.toString(state.actorId()));
            return json.writeValueAsString(object);
        } catch (Exception exception) {
            throw new IllegalStateException("Remote ticket 状态序列化失败", exception);
        }
    }

    private <T> T read(String value, Class<T> type) {
        try {
            return json.readValue(value, type);
        } catch (Exception exception) {
            throw new IllegalStateException("Remote 状态反序列化失败", exception);
        }
    }

    private static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 不可用", exception);
        }
    }

    private static String fingerprint(long deviceId, RemoteTicketRequest request) {
        List<String> capabilities = new ArrayList<>(request.requestedCapabilities());
        capabilities.sort(Comparator.naturalOrder());
        return digest(deviceId + "\n" + request.controllerDeviceId() + "\n" + request.controllerPublicKey() + "\n" + String.join(",", capabilities) + "\n" + request.clientVersion());
    }

    private static boolean validConsumeInput(
        String ticket,
        String linkId,
        String deviceId,
        String controllerId,
        String controllerPublicKey
    ) {
        return ticket != null && ticket.length() >= 32 && ticket.length() <= 512
            && RemoteProtocol.LINK_ID.matcher(linkId == null ? "" : linkId).matches()
            && RemoteProtocol.DEVICE_ID.matcher(deviceId == null ? "" : deviceId).matches()
            && RemoteProtocol.CONTROLLER_ID.matcher(controllerId == null ? "" : controllerId).matches()
            && RemoteProtocol.isPublicKey(controllerPublicKey);
    }

    private static boolean matches(
        RemoteTicketState state,
        String linkId,
        String deviceId,
        String controllerId,
        String controllerPublicKey
    ) {
        return linkId.equals(state.linkId()) && deviceId.equals(state.deviceId())
            && controllerId.equals(state.controllerDeviceId())
            && MessageDigest.isEqual(
                state.controllerPublicKey().getBytes(StandardCharsets.UTF_8),
                controllerPublicKey.getBytes(StandardCharsets.UTF_8)
            );
    }

    private static boolean validLeaseInput(String linkId, String leaseId, int ttlSeconds) {
        return RemoteProtocol.LINK_ID.matcher(linkId == null ? "" : linkId).matches()
            && leaseId != null && leaseId.length() >= 16 && leaseId.length() <= 128
            && ttlSeconds > 0 && ttlSeconds <= 3600;
    }

    private static String hmac(String username, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
            return Base64.getEncoder().encodeToString(mac.doFinal(username.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("TURN 凭据生成失败", exception);
        }
    }

    public record RemoteLeaseResult(String linkId, String leaseId, Instant expiresAt, long epoch) {
    }

    private record RemoteIdempotencyState(String fingerprint, RemoteTicket ticket) {
    }

    private static final class RemoteIds {
        private static final char[] ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();

        private static String ulid(String prefix) {
            byte[] bytes = new byte[16];
            RANDOM.nextBytes(bytes);
            StringBuilder result = new StringBuilder(26);
            int buffer = 0;
            int bits = 0;
            for (byte value : bytes) {
                buffer = (buffer << 8) | (value & 0xff);
                bits += 8;
                while (bits >= 5) {
                    bits -= 5;
                    result.append(ALPHABET[(buffer >>> bits) & 31]);
                }
            }
            if (bits > 0) result.append(ALPHABET[(buffer << (5 - bits)) & 31]);
            while (result.length() < 26) result.append('0');
            return prefix + result;
        }
    }
}
