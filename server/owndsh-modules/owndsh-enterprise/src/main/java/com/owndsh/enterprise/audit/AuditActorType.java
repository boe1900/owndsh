/**
 * [INPUT]: 区分登录用户行为与平台后台行为。
 * [OUTPUT]: 对外提供与 V4 actor_type check 一致的 AuditActorType。
 * [POS]: audit actor 身份分类，配合 AuditEvent 强制 USER 必须携带 actorId。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.audit;

/**
 * 审计操作者类型。
 */
public enum AuditActorType {
    USER,
    SYSTEM
}
