/**
 * [INPUT]: 接收可信管理请求的租户、操作者、requestId 和脱敏来源信息。
 * [OUTPUT]: 提供 skill catalog 写操作共用的审计上下文。
 * [POS]: skill/application 的管理写入边界，不让 Controller 直接拼审计事件。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

import java.util.Objects;

public record SkillMutationContext(
    String tenantId,
    long actorId,
    String requestId,
    String sourceIp,
    byte[] userAgentHash
) {
    public SkillMutationContext {
        if (tenantId == null || tenantId.isBlank() || tenantId.length() > 20 || actorId <= 0) {
            throw new IllegalArgumentException("skill mutation context 非法");
        }
        Objects.requireNonNull(requestId, "requestId");
        Objects.requireNonNull(userAgentHash, "userAgentHash");
        userAgentHash = userAgentHash.clone();
    }

    @Override
    public byte[] userAgentHash() {
        return userAgentHash.clone();
    }
}
