/**
 * [INPUT]: 依赖 RemoteControlService 的 lease fencing 结果。
 * [OUTPUT]: 对外提供不含 Redis owner 或内部 epoch 的撤权响应。
 * [POS]: remote/web 的 lease 响应 DTO；撤权状态对客户端幂等可见。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote.web;

import com.owndsh.enterprise.remote.application.RemoteControlService;

import java.time.Instant;

public record RemoteLeaseView(String linkId, String leaseId, Instant expiresAt, String status) {
    public static RemoteLeaseView revoked(RemoteControlService.RemoteLeaseResult value) {
        return new RemoteLeaseView(value.linkId(), value.leaseId(), value.expiresAt(), "REVOKED");
    }
}
