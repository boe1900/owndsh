/**
 * [INPUT]: 依赖管理员上下文、RemoteDeviceStore、Redis ticket/link 状态、JsonMapper 和 coturn 配置。
 * [OUTPUT]: 提供设备列表、能力读取、一次性 ticket 签发与 lease fencing，Redis ticket 将 64 位 actorId 按十进制字符串编码避免 Lua 精度损失。
 * [POS]: remote/application 的唯一控制面编排；Controller 不直接拼 SQL、Redis key 或加密凭据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote.application;

import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
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

    public RemoteTicket createTicket(
        EnterpriseRequestContext context,
        long deviceId,
        UUID idempotencyKey,
        RemoteTicketRequest request
    ) {
        RemoteDeviceSnapshot device = get(context, deviceId);
        Instant now = clock.instant();
        if (device.status().name().equals("REVOKED")) throw new RemoteControlException("ENT_DEVICE_REVOKED");
        if (!device.remoteEnabled()) throw new RemoteControlException("ENT_REMOTE_DISABLED");
        if (!device.connectable(now)) throw new RemoteControlException("ENT_REMOTE_UNAVAILABLE");
        if (request.requestedCapabilities().stream().anyMatch(capability -> !device.capabilities().contains(capability))) {
            throw new RemoteControlException("ENT_REMOTE_FEATURE_NOT_SUPPORTED");
        }

        String linkId = RemoteIds.ulid("rln_");
        String ticket = randomToken();
        Instant expiresAt = now.plus(TICKET_TTL);
        RemoteTicket response = new RemoteTicket(ticket, linkId, Long.toString(device.deviceId()), expiresAt, iceServers(linkId, expiresAt));
        RemoteTicketState state = new RemoteTicketState(
            context.tenantId(), context.actorId(), Long.toString(device.deviceId()), linkId,
            request.controllerDeviceId(), request.controllerPublicKey(), request.requestedCapabilities(), expiresAt
        );
        String fingerprint = fingerprint(deviceId, request);
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
        long epoch = redis.revokeLink(
            "remote:link:" + linkId,
            "remote:lease:" + linkId,
            "remote:revoke:" + linkId
        );
        return new RemoteLeaseResult(linkId, "lease_" + linkId.substring(4), clock.instant(), epoch);
    }

    public Optional<RemoteTicketState> consumeTicket(
        String ticket,
        String linkId,
        String deviceId,
        String controllerId,
        String controllerPublicKey
    ) {
        if (!validConsumeInput(ticket, linkId, deviceId, controllerId, controllerPublicKey)) return Optional.empty();
        Optional<String> candidate = redis.read("remote:ticket:" + digest(ticket));
        if (candidate.isEmpty()) return Optional.empty();
        RemoteTicketState state = read(candidate.get(), RemoteTicketState.class);
        if (!matches(state, linkId, deviceId, controllerId, controllerPublicKey)
            || !state.expiresAt().isAfter(clock.instant())) return Optional.empty();
        return redis.consumeTicketStateBound(
            "remote:ticket:" + digest(ticket), state.tenantId(), state.actorId(),
            linkId, deviceId, controllerId, controllerPublicKey
        ).map(value -> read(value, RemoteTicketState.class));
    }

    public boolean authorizePeer(RemotePeerIdentity identity, String role, String peerId, String publicKey) {
        if (identity == null) return false;
        if ("controller".equals(role)) return RemoteProtocol.CONTROLLER_ID.matcher(peerId).matches();
        if (!"host".equals(role) || !RemoteProtocol.DEVICE_ID.matcher(peerId).matches()) return false;
        try {
            RemoteDeviceSnapshot device = devices.findByDeviceId(Long.parseLong(peerId), clock.instant()).orElse(null);
            return device != null
                && identity.tenantId().equals(device.tenantId())
                && identity.actorId() == device.userId()
                && identity.deviceId().equals(String.valueOf(device.installationId()))
                && device.status().name().equals("ACTIVE");
        } catch (NumberFormatException exception) {
            return false;
        }
    }

    public Optional<RemoteTicketState> consumeTicket(
        String ticket,
        String linkId,
        String deviceId,
        String controllerId,
        String controllerPublicKey,
        RemotePeerIdentity identity
    ) {
        if (identity == null || !validConsumeInput(ticket, linkId, deviceId, controllerId, controllerPublicKey)) return Optional.empty();
        Optional<String> raw = redis.consumeTicketStateBound(
            "remote:ticket:" + digest(ticket), identity.tenantId(), identity.actorId(), linkId, deviceId,
            controllerId, controllerPublicKey
        );
        if (raw.isEmpty()) return Optional.empty();
        RemoteTicketState state = read(raw.get(), RemoteTicketState.class);
        if (!state.expiresAt().isAfter(clock.instant())) return Optional.empty();
        return Optional.of(state);
    }

    public Optional<Instant> acquireLease(String linkId, String leaseId, int ttlSeconds) {
        if (!validLeaseInput(linkId, leaseId, ttlSeconds)) return Optional.empty();
        Optional<String> link = redis.read("remote:link:" + linkId);
        if (link.isEmpty()) return Optional.empty();
        Instant expiresAt = clock.instant().plusSeconds(ttlSeconds);
        return redis.acquireLease("remote:lease:" + linkId, leaseId, ttlSeconds * 1000L) ? Optional.of(expiresAt) : Optional.empty();
    }

    public boolean renewLease(String linkId, String leaseId, int ttlSeconds) {
        if (!validLeaseInput(linkId, leaseId, ttlSeconds)) return false;
        return redis.renewLease("remote:lease:" + linkId, leaseId, ttlSeconds * 1000L);
    }

    public void releaseLease(String linkId, String leaseId) {
        if (!validLeaseInput(linkId, leaseId, 1)) return;
        redis.releaseLease("remote:lease:" + linkId, leaseId);
    }

    public void updatePresence(String deviceId, String state, boolean remoteEnabled, String capabilities, long lastSeenAt) {
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
        devices.updatePresence(device.tenantId(), id, state, remoteEnabled, values, List.of("relay", "lan", "p2p", "turn"), Instant.ofEpochMilli(lastSeenAt));
        redis.updatePresence("remote:presence:" + deviceId, state, RemoteProtocol.PRESENCE_TTL_SECONDS * 1000L);
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
        if (ticket == null || ticket.length() < 32 || ticket.length() > 512
            || !RemoteProtocol.LINK_ID.matcher(linkId == null ? "" : linkId).matches()
            || !RemoteProtocol.DEVICE_ID.matcher(deviceId == null ? "" : deviceId).matches()
            || !RemoteProtocol.CONTROLLER_ID.matcher(controllerId == null ? "" : controllerId).matches()
            || controllerPublicKey == null || controllerPublicKey.length() > 64) return false;
        try {
            return Base64.getUrlDecoder().decode(controllerPublicKey).length == 32;
        } catch (IllegalArgumentException exception) {
            return false;
        }
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
