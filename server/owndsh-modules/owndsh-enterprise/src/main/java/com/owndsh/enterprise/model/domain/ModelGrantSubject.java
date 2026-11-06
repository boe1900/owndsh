/**
 * [INPUT]: 聚合授权主体 ID 与管理读投影名称。
 * [OUTPUT]: 对外提供 ModelGrant 携带的多主体条目 ModelGrantSubject。
 * [POS]: model/domain 的授权主体条目，subjectName 是可信 join 投影而非授权依据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.domain;

public record ModelGrantSubject(long subjectId, String subjectName) {
    public ModelGrantSubject {
        if (subjectId <= 0) {
            throw new IllegalArgumentException("subjectId 必须为正数");
        }
        if (subjectName == null || subjectName.isBlank() || subjectName.length() > 120) {
            throw new IllegalArgumentException("subjectName 非法");
        }
    }
}
