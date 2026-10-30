/**
 * [INPUT]: 接收租户边界、凭据密文和 revision CAS。
 * [OUTPUT]: 提供仓库凭据列表、读取、写入和状态轮换端口。
 * [POS]: skill/persistence 的凭据存储 DIP 边界，隐藏 PostgreSQL 字段与密文列。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.persistence;

import com.owndsh.enterprise.skill.domain.SkillSourceCredential;

import java.util.List;
import java.util.Optional;

public interface SkillSourceCredentialStore {
    List<SkillSourceCredential> list(String tenantId);
    Optional<SkillSourceCredential> find(String tenantId, long id);
    void insert(SkillSourceCredential credential, long createdBy);
    boolean update(SkillSourceCredential credential, long expectedRevision);
    boolean updateStatus(String tenantId, long id, SkillSourceCredential.Status status, long expectedRevision);
}
