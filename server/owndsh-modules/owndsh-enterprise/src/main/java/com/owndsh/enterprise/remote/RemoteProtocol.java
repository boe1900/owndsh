/**
 * [INPUT]: 依赖 contracts/remote 的 Remote v1 wire 约定。
 * [OUTPUT]: 对外提供 Java listener 使用的稳定版本、路径、大小、TTL、close code 常量与规范 X25519 公钥编码校验。
 * [POS]: remote 的纯协议核心，不依赖 Spring、Netty、Redis 或 Typert 业务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import java.util.regex.Pattern;
import java.util.Base64;
import java.util.Set;

public final class RemoteProtocol {
    public static final int VERSION = 1;
    public static final String PROTOCOL_SHA256 = "c6ec6febc41a5c971a8a320ced9d4765eafd0da38f6a0c725828cf2c44bf99aa";
    public static final String WEBSOCKET_PATH = "/remote/ws/v1";
    public static final int MAX_FRAME_BYTES = 262_144;
    public static final int MAX_RELAY_PAYLOAD_BYTES = 65_536;
    public static final int LEASE_TTL_SECONDS = 60;
    public static final int LEASE_RENEW_SECONDS = 20;
    public static final int PRESENCE_TTL_SECONDS = 90;
    public static final Pattern DEVICE_ID = Pattern.compile("^[1-9][0-9]{0,18}$");
    public static final Pattern CONTROLLER_ID = Pattern.compile("^ctl_[0-9A-HJKMNP-TV-Z]{26}$");
    public static final Pattern PEER_ID = Pattern.compile("^(?:[1-9][0-9]{0,18}|ctl_[0-9A-HJKMNP-TV-Z]{26})$");
    public static final Set<String> CONTROL_TYPES = Set.of(
        "hello", "hello.ack", "presence.update", "connect.request", "connect.accept", "connect.reject",
        "signal.offer", "signal.answer", "signal.candidate", "transport.selected", "secure.handshake",
        "connection.lease.acquire", "connection.lease.renew", "connection.lease.release", "error"
    );
    public static final Set<String> CAPABILITIES = Set.of("remote.connect", "host.describe");
    public static final Pattern LINK_ID = Pattern.compile("^rln_[0-9A-HJKMNP-TV-Z]{26}$");
    public static final int CLOSE_NORMAL = 1000;
    public static final int CLOSE_AUTH_REQUIRED = 4001;
    public static final int CLOSE_DEVICE_REVOKED = 4003;
    public static final int CLOSE_LEASE_EXPIRED = 4008;
    public static final int CLOSE_PROTOCOL_ERROR = 4400;
    public static final int CLOSE_FRAME_TOO_LARGE = 4409;
    public static final int CLOSE_SERVER_DRAINING = 4503;

    public static boolean isPublicKey(String value) {
        if (value == null || value.length() != 43) return false;
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(value);
            return decoded.length == 32 && Base64.getUrlEncoder().withoutPadding().encodeToString(decoded).equals(value);
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private RemoteProtocol() {}
}
