/**
 * [INPUT]: 依赖发布中的 SkillRelease 与 SkillViews runtime 投影。
 * [OUTPUT]: 验证 bootstrap/runtime 技能元数据不泄漏管理字段，且能通过客户端严格契约。
 * [POS]: skill/web DTO 回归门禁，隔离数据库和 HTTP 控制器。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill;

import com.owndsh.enterprise.skill.domain.SkillRelease;
import com.owndsh.enterprise.skill.web.SkillViews;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class SkillViewsTest {
    @Test
    void runtimeMetadataContainsOnlyTheRuntimeSkillContract() {
        SkillRelease release = new SkillRelease(9001, "000000", "code-review", "1.0.0", "Review", "MIT", "OwnDsh",
            true, true, List.of("dev"), 1024,
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", SkillRelease.Status.PUBLISHED, 7);

        JsonNode metadata = JsonMapper.builder().build().valueToTree(SkillViews.runtime(release).metadata());

        assertThat(metadata.toString()).isEqualTo("{\"name\":\"code-review\",\"version\":\"1.0.0\",\"description\":\"Review\",\"license\":\"MIT\",\"author\":\"OwnDsh\",\"userInvocable\":true,\"modelInvocable\":true,\"categories\":[\"dev\"]}");
        assertThat(metadata.has("id")).isFalse();
        assertThat(metadata.has("status")).isFalse();
        assertThat(metadata.has("revision")).isFalse();
    }
}
