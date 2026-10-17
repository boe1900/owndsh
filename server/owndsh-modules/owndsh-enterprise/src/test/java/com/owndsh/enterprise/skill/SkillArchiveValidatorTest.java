/**
 * [INPUT]: 构造 GitHub/GitLab 风格 ZIP 归档与恶意路径样本。
 * [OUTPUT]: 验证固定 skill 根、WorkBuddy frontmatter、调用策略、大小和路径边界。
 * [POS]: skill/application 的 P1 导入信任门禁，不替代真实 GitLab CE 联调。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill;

import com.owndsh.enterprise.skill.application.HttpSkillSourceClient;
import com.owndsh.enterprise.skill.application.SkillArchiveValidator;
import com.owndsh.enterprise.skill.application.SkillSourceClient;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class SkillArchiveValidatorTest {
    private final SkillArchiveValidator validator = new SkillArchiveValidator();

    @Test
    void normalizesRepositoryArchiveAndKeepsInvocationPolicy() {
        byte[] archive = zip(
            "repo-abc123/skills/code-review/SKILL.md",
            "---\nname: code-review\nversion: 1.2.3\ndescription: Review code\nauthor: OwnDsh\n" +
                "category: engineering\ndisable-model-invocation: true\nuser-invocable: true\n---\n\nbody\n",
            "repo-abc123/skills/code-review/references/checklist.md", "check"
        );

        SkillArchiveValidator.ValidatedSkill result = validator.validate(
            new ByteArrayInputStream(archive), "skills/code-review");

        assertThat(result.name()).isEqualTo("code-review");
        assertThat(result.version()).isEqualTo("1.2.3");
        assertThat(result.categories()).containsExactly("engineering");
        assertThat(result.userInvocable()).isTrue();
        assertThat(result.modelInvocable()).isFalse();
        assertThat(result.archive()).isNotEqualTo(archive);
        assertThat(result.sha256()).hasSize(64).matches("[0-9a-f]{64}");
    }

    @Test
    void rejectsTraversalAndMismatchedDirectoryIdentity() {
        assertThatThrownBy(() -> validator.validate(new ByteArrayInputStream(zip(
            "repo/skill/SKILL.md", "---\nname: another\nversion: 1.0.0\ndescription: x\nauthor: y\n---\n",
            "repo/../outside.txt", "bad"
        )), "skill"))
            .isInstanceOf(SkillArchiveValidator.SkillArchiveException.class);
    }

    @Test
    void rejectsMissingRequiredFrontmatter() {
        assertThatThrownBy(() -> validator.validate(new ByteArrayInputStream(zip(
            "repo/code-review/SKILL.md", "---\nname: code-review\ndescription: x\n---\n"
        )), "code-review"))
            .isInstanceOf(SkillArchiveValidator.SkillArchiveException.class)
            .hasMessageContaining("version");
    }

    @Test
    void rejectsTruncatedZipBeforeParsingCentralDirectory() {
        assertThatThrownBy(() -> validator.validate(
            new ByteArrayInputStream(new byte[] {0x50, 0x4b, 0x03}), ""))
            .isInstanceOf(SkillArchiveValidator.SkillArchiveException.class)
            .hasMessageContaining("central directory");
    }

    @Test
    void sourceClientRefusesNonHttpsAndCredentialsBeforeNetwork() {
        HttpSkillSourceClient client = new HttpSkillSourceClient(tools.jackson.databind.json.JsonMapper.builder().build());

        assertThatThrownBy(() -> client.fetch(new SkillSourceClient.Source(
            "http://github.com/owner/repo", "main", "")))
            .isInstanceOf(HttpSkillSourceClient.SkillSourceException.class);
        assertThatThrownBy(() -> client.fetch(new SkillSourceClient.Source(
            "https://user:secret@github.com/owner/repo", "main", "")))
            .isInstanceOf(HttpSkillSourceClient.SkillSourceException.class);
    }

    private static byte[] zip(String... entries) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (ZipOutputStream zip = new ZipOutputStream(output, StandardCharsets.UTF_8)) {
                for (int i = 0; i < entries.length; i += 2) {
                    zip.putNextEntry(new ZipEntry(entries[i]));
                    zip.write(entries[i + 1].getBytes(StandardCharsets.UTF_8));
                    zip.closeEntry();
                }
            }
            return output.toByteArray();
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }
}
