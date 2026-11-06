/**
 * [INPUT]: 聚合配额策略主体 ID 与管理读投影名称。
 * [OUTPUT]: 对外提供 QuotaPolicy 携带的多主体条目 QuotaPolicySubject。
 * [POS]: quota/domain 的策略主体条目，subjectName 是可信 join 投影而非计量依据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.domain;

public record QuotaPolicySubject(long subjectId, String subjectName) {
    public QuotaPolicySubject {
        if (subjectId <= 0) {
            throw new IllegalArgumentException("subjectId 必须为正数");
        }
        if (subjectName == null || subjectName.isBlank() || subjectName.length() > 120) {
            throw new IllegalArgumentException("subjectName 非法");
        }
    }
}
