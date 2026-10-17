/**
 * [INPUT]: 接收 skill 登记、发布、撤销的操作类型和 revision 聚合信息。
 * [OUTPUT]: 提供不含正文、来源地址和凭据的 skill 审计 metadata。
 * [POS]: skill/application 的审计白名单，与 AuditAction 和数据库约束同构。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

import com.owndsh.enterprise.audit.AuditAction;
import com.owndsh.enterprise.audit.AuditMetadata;

import java.util.Objects;

public record SkillAuditMetadata(
    Operation operation,
    long resourceRevision,
    long bootstrapRevision,
    int itemCount
) implements AuditMetadata {
    public SkillAuditMetadata {
        Objects.requireNonNull(operation, "operation");
        if (resourceRevision < 0 || bootstrapRevision < 0 || itemCount < 0 || itemCount > 500) {
            throw new IllegalArgumentException("skill 审计 metadata 非法");
        }
    }

    public enum Operation { REGISTER, PUBLISH, REVOKE }

    @Override
    public AuditAction action() {
        return switch (operation) {
            case REGISTER -> AuditAction.SKILL_REGISTERED;
            case PUBLISH -> AuditAction.SKILL_PUBLISHED;
            case REVOKE -> AuditAction.SKILL_REVOKED;
        };
    }
}
