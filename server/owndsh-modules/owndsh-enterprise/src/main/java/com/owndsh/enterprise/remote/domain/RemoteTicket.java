/**
 * [INPUT]: 依赖 Remote ticket 请求、设备身份摘要和配置的 ICE server。
 * [OUTPUT]: 对外提供短期一次性 ticket 以及其公开建链参数；不保存登录 Token 或 Noise 私钥。
 * [POS]: remote/domain 的控制面授权值，Redis 只保存其短期序列化副本。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote.domain;

import java.time.Instant;
import java.util.List;

public record RemoteTicket(
    String ticket,
    String linkId,
    String deviceId,
    Instant expiresAt,
    List<IceServer> iceServers
) {
    public RemoteTicket {
        iceServers = List.copyOf(iceServers);
    }

    public record IceServer(List<String> urls, String username, String credential) {
        public IceServer {
            urls = List.copyOf(urls);
            if (urls.isEmpty()) throw new IllegalArgumentException("ICE server urls are required");
        }
    }
}
