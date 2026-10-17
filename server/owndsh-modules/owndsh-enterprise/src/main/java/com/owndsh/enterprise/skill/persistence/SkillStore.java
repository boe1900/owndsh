/**
 * [INPUT]: 接收 tenant 与 release 目录领域事实。
 * [OUTPUT]: 提供已发布目录查询、release 状态变更和登记端口。
 * [POS]: skill/application 的 PostgreSQL DIP 边界，隐藏 JSONB、分页和租户 SQL。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.persistence;

import com.owndsh.enterprise.skill.domain.SkillRelease;

import java.util.List;
import java.util.Optional;

public interface SkillStore {
    List<SkillRelease> listReleases(String tenantId, long afterId, int limit);

    List<SkillRelease> listPublishedReleases(String tenantId, int limit);

    Optional<SkillRelease> findRelease(String tenantId, long releaseId);

    Optional<SkillRelease> findRelease(String tenantId, String name, String version);

    boolean transitionRelease(String tenantId, long releaseId, SkillRelease.Status from,
        SkillRelease.Status to, long expectedRevision);

    void insertRelease(SkillRelease release, long createdBy);
}
