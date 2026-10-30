/**
 * [INPUT]: 依赖发布中的 SkillRelease 与 SkillViews runtime 投影。
 * [OUTPUT]: 验证 bootstrap/runtime 技能元数据不泄漏管理字段，且管理目录投影符合客户端严格契约。
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

    @Test
    void adminReleaseProjectionIsFlat() {
        SkillRelease release = new SkillRelease(9001, "000000", "code-review", "1.0.0", "Review", "MIT", "OwnDsh",
            true, true, List.of("dev"), 1024,
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "GITHUB", "https://github.com/own/company-skills",
            "abcdef0123456789abcdef0123456789abcdef01", "SOURCE_ARCHIVE", "artifact.zip", SkillRelease.Status.PUBLISHED, 7);

        JsonNode projected = JsonMapper.builder().build().valueToTree(SkillViews.release(release));

        assertThat(projected.get("name").asText()).isEqualTo("code-review");
        assertThat(projected.has("release")).isFalse();
        assertThat(projected.get("repositoryUrl").asText()).isEqualTo(
            "https://github.com/own/company-skills/tree/abcdef0123456789abcdef0123456789abcdef01");
        assertThat(projected.has("repositoryPath")).isFalse();
    }
}
