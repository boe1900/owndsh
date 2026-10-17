/**
 * [INPUT]: 依赖临时目录、合法 ZIP 字节和 SHA-256。
 * [OUTPUT]: 验证 artifact 幂等保存、摘要校验和符号链接拒绝读取。
 * [POS]: skill/application 的本地制品 adapter 回归；不替代 GitLab Package Registry 门禁。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill;

import com.owndsh.enterprise.skill.application.FilesystemSkillArtifactStore;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class SkillArtifactStoreTest {
    @Test
    void savesOnceAndRejectsMismatchedDigest(@TempDir Path root) throws Exception {
        byte[] bytes = "artifact".getBytes();
        String sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        FilesystemSkillArtifactStore store = new FilesystemSkillArtifactStore(root);

        store.putIfAbsent(sha, bytes);
        store.putIfAbsent(sha, bytes);

        assertThat(store.size(sha)).isEqualTo(bytes.length);
        assertThat(store.open(sha).readAllBytes()).containsExactly(bytes);
        assertThatThrownBy(() -> store.putIfAbsent(sha, "changed".getBytes()))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void doesNotReadSymlinkAsArtifact(@TempDir Path root) throws Exception {
        Path external = Files.writeString(root.resolve("external"), "secret");
        String sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        Files.createSymbolicLink(root.resolve(sha + ".zip"), external);
        FilesystemSkillArtifactStore store = new FilesystemSkillArtifactStore(root);

        assertThatThrownBy(() -> store.open(sha))
            .isInstanceOf(FilesystemSkillArtifactStore.SkillArtifactNotFoundException.class);
    }
}
