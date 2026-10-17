/**
 * [INPUT]: 依赖 SkillStore 的已发布目录查询与全局 BOOTSTRAP revision。
 * [OUTPUT]: 对外提供当前租户可见的已发布 skill 集合及单调 revision。
 * [POS]: skill/application 的目录读取入口，bootstrap 与 runtime 下载共同复用；不执行用户或设备授权。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import com.owndsh.enterprise.skill.domain.SkillRelease;
import com.owndsh.enterprise.skill.persistence.SkillStore;

import java.util.List;
import java.util.Objects;

public final class EffectiveSkillResolver {
    private final SkillStore skills;
    private final BootstrapRevisionStore revisions;

    public EffectiveSkillResolver(SkillStore skills, BootstrapRevisionStore revisions) {
        this.skills = Objects.requireNonNull(skills, "skills");
        this.revisions = Objects.requireNonNull(revisions, "revisions");
    }

    public ResolvedSkills resolve(String tenantId) {
        return new ResolvedSkills(revisions.current(tenantId), skills.listPublishedReleases(tenantId, 200));
    }

    public record ResolvedSkills(long revision, List<SkillRelease> skills) {
        public ResolvedSkills {
            if (revision < 0) throw new IllegalArgumentException("revision 不能为负数");
            skills = List.copyOf(Objects.requireNonNull(skills, "skills"));
        }
    }
}
