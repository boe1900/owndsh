/**
 * [INPUT]: 接收已授权模型、reservation 与服务端 Token 估算事实。
 * [OUTPUT]: 对外提供 MODEL_REQUEST_ACCEPTED 审计的显式白名单 metadata。
 * [POS]: model/gateway 到 audit 的 accepted 接缝，不包含 alias、prompt、provider 或 credential。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.gateway;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditMetadata;

import java.util.Objects;
import java.util.UUID;

public record GatewayAcceptedMetadata(long modelId, UUID reservationId, long estimatedTokens)
    implements AuditMetadata {
    public GatewayAcceptedMetadata {
        if (modelId <= 0 || estimatedTokens <= 0) throw new IllegalArgumentException("accepted metadata 数值非法");
        Objects.requireNonNull(reservationId, "reservationId");
    }

    @Override
    public AuditAction action() {
        return AuditAction.MODEL_REQUEST_ACCEPTED;
    }
}
