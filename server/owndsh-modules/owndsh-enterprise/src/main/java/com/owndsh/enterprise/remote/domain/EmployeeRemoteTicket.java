/**
 * [INPUT]: 依赖既有 ticket 响应与数据库已认证的 Host 公钥。
 * [OUTPUT]: 提供 Harness/Console 本人设备建链参数，将 Host 身份绑定到一次性授权。
 * [POS]: remote/domain 的本人设备响应值，保持管理端 RemoteTicket 的公开形状不变。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote.domain;

import java.time.Instant;
import java.util.List;

public record EmployeeRemoteTicket(
    String ticket,
    String linkId,
    String deviceId,
    Instant expiresAt,
    List<RemoteTicket.IceServer> iceServers,
    String hostPublicKey
) {
    public static EmployeeRemoteTicket from(RemoteTicket ticket, String hostPublicKey) {
        return new EmployeeRemoteTicket(ticket.ticket(), ticket.linkId(), ticket.deviceId(), ticket.expiresAt(), ticket.iceServers(), hostPublicKey);
    }
}
