/**
 * [INPUT]: 依赖假的公开源码客户端、真实归档校验器和 mock catalog/artifact store。
 * [OUTPUT]: 验证固定 commit 传递、DRAFT 登记、重复导入幂等和校验失败不写制品。
 * [POS]: skill/application 的导入编排回归；不替代真实 GitLab/GitHub 网络联调。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill;

import com.owndsh.enterprise.skill.application.SkillArchiveValidator;
import com.owndsh.enterprise.skill.application.SkillArtifactStore;
import com.owndsh.enterprise.skill.application.SkillCatalogService;
import com.owndsh.enterprise.skill.application.SkillImportService;
import com.owndsh.enterprise.skill.application.SkillMutationContext;
import com.owndsh.enterprise.skill.application.SkillSourceClient;
import com.owndsh.enterprise.skill.domain.SkillRelease;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import java.util.concurrent.atomic.AtomicReference;

@Tag("dev")
class SkillImportServiceTest {
    private static final SkillMutationContext CONTEXT = new SkillMutationContext(
        "000000", 7, "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "127.0.0.1", new byte[32]
    );
    private static final SkillSourceClient.Source SOURCE = new SkillSourceClient.Source(
        "https://gitlab.example.com/team/skills", "main", "skills/code-review"
    );

    @Test
    void passesResolvedCommitRegistersDraftAndStoresArtifact() {
        byte[] archive = zip("repo-main/skills/code-review/SKILL.md",
            "---\nname: code-review\nversion: 1.2.3\ndescription: Review\n" +
                "author: OwnDsh\nuser-invocable: true\n---\n\nbody\n");
        SkillSourceClient sources = sourceClient(archive);
        SkillArtifactStore artifacts = mock(SkillArtifactStore.class);
        SkillCatalogService catalog = mock(SkillCatalogService.class);
        AtomicReference<SkillCatalogService.SkillReleaseDraft> draft = new AtomicReference<>();
        SkillRelease release = release(SkillRelease.Status.DRAFT);
        when(catalog.register(any(), any())).thenAnswer(invocation -> {
            draft.set(invocation.getArgument(1));
            return new SkillCatalogService.RegistrationResult(release, true);
        });

        SkillImportService.ImportResult result = new SkillImportService(
            sources, new SkillArchiveValidator(), artifacts, catalog
        ).importDraft(CONTEXT, SOURCE);

        assertThat(result.resolvedCommit()).isEqualTo("abcdef0123456789abcdef0123456789abcdef01");
        assertThat(result.registration().release().status()).isEqualTo(SkillRelease.Status.DRAFT);
        assertThat(draft.get().name()).isEqualTo("code-review");
        assertThat(draft.get().version()).isEqualTo("1.2.3");
        verify(artifacts).putIfAbsent(any(String.class), any(byte[].class), any(SkillArtifactStore.ArtifactCoordinate.class));
    }

    @Test
    void keepsIdenticalImportIdempotent() {
        byte[] archive = zip("repo-main/code-review/SKILL.md",
            "---\nname: code-review\nversion: 1.2.3\ndescription: Review\n" +
                "author: OwnDsh\n---\nbody\n");
        SkillArtifactStore artifacts = mock(SkillArtifactStore.class);
        SkillCatalogService catalog = mock(SkillCatalogService.class);
        when(catalog.register(any(), any())).thenReturn(
            new SkillCatalogService.RegistrationResult(release(SkillRelease.Status.DRAFT), false));

        SkillImportService.ImportResult result = new SkillImportService(
            sourceClient(archive), new SkillArchiveValidator(), artifacts, catalog
        ).importDraft(CONTEXT, new SkillSourceClient.Source(SOURCE.repositoryUrl(), SOURCE.revision(), "code-review"));

        assertThat(result.registration().created()).isFalse();
        verify(artifacts).putIfAbsent(any(String.class), any(byte[].class), any(SkillArtifactStore.ArtifactCoordinate.class));
    }

    @Test
    void sourceArchiveProviderDoesNotPersistValidatedBytes() {
        byte[] archive = zip("repo-main/code-review/SKILL.md",
            "---\nname: code-review\nversion: 1.2.3\ndescription: Review\n" +
                "author: OwnDsh\n---\nbody\n");
        SkillArtifactStore artifacts = mock(SkillArtifactStore.class);
        when(artifacts.provider()).thenReturn("SOURCE_ARCHIVE");
        SkillCatalogService catalog = mock(SkillCatalogService.class);
        when(catalog.register(any(), any())).thenReturn(
            new SkillCatalogService.RegistrationResult(release(SkillRelease.Status.DRAFT), true));

        new SkillImportService(sourceClient(archive), new SkillArchiveValidator(), artifacts, catalog)
            .importDraft(CONTEXT, new SkillSourceClient.Source(SOURCE.repositoryUrl(), SOURCE.revision(), "code-review"));

        verify(artifacts, org.mockito.Mockito.never()).putIfAbsent(
            any(String.class), any(byte[].class), any(SkillArtifactStore.ArtifactCoordinate.class));
    }

    @Test
    void rejectsInvalidArchiveBeforeWritingOrRegistering() {
        SkillArtifactStore artifacts = mock(SkillArtifactStore.class);
        SkillCatalogService catalog = mock(SkillCatalogService.class);

        assertThatThrownBy(() -> new SkillImportService(
            sourceClient(zip("repo-main/code-review/SKILL.md", "---\nname: wrong\n---\n")),
            new SkillArchiveValidator(), artifacts, catalog
        ).importDraft(CONTEXT, new SkillSourceClient.Source(SOURCE.repositoryUrl(), SOURCE.revision(), "code-review")))
            .isInstanceOf(SkillArchiveValidator.SkillArchiveException.class);

        verifyNoInteractions(artifacts, catalog);
    }

    private static SkillSourceClient sourceClient(byte[] archive) {
        return source -> new SkillSourceClient.FetchedArchive(
            "abcdef0123456789abcdef0123456789abcdef01", archive
        );
    }

    private static SkillRelease release(SkillRelease.Status status) {
        return new SkillRelease(9001, "000000", "code-review", "1.2.3", "Review", "MIT", "OwnDsh",
            true, true, List.of(), 128,
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", status, 0);
    }

    private static byte[] zip(String path, String content) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (java.util.zip.ZipOutputStream zip = new java.util.zip.ZipOutputStream(output, StandardCharsets.UTF_8)) {
                zip.putNextEntry(new java.util.zip.ZipEntry(path));
                zip.write(content.getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
            return output.toByteArray();
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }
}
