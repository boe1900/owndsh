/**
 * [INPUT]: 依赖 mock ACTIVE 设备、公开 skill catalog 和 release 查询。
 * [OUTPUT]: 验证 runtime 目录只依赖发布状态，撤销 release 不可下载。
 * [POS]: skill/application runtime 单元门禁；不替代 PostgreSQL migration/tenant SQL 验收。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill;

import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.application.DeviceService;
import com.owndsh.enterprise.device.domain.DeviceStatus;
import com.owndsh.enterprise.device.domain.EnterpriseDevice;
import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import com.owndsh.enterprise.skill.application.EffectiveSkillResolver;
import com.owndsh.enterprise.skill.application.SkillRuntimeService;
import com.owndsh.enterprise.skill.domain.SkillRelease;
import com.owndsh.enterprise.skill.persistence.SkillStore;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Tag("dev")
class SkillRuntimeServiceTest {
    private static final DeviceCallContext CONTEXT = new DeviceCallContext(
        "000000", new PlatformSession(101, PlatformClient.DSH_DESKTOP, "harness",
            "123e4567-e89b-42d3-a456-426614174010"),
        "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "127.0.0.1", new byte[32]
    );

    @Test
    void exposesPublishedCatalogAndPublishedArtifact() {
        DeviceService devices = mock(DeviceService.class);
        SkillStore skills = mock(SkillStore.class);
        EffectiveSkillResolver resolver = new EffectiveSkillResolver(skills, mock(BootstrapRevisionStore.class));
        SkillRelease published = release(SkillRelease.Status.PUBLISHED);
        when(devices.requireActive(CONTEXT)).thenReturn(activeDevice());
        when(skills.findRelease("000000", 9001L)).thenReturn(java.util.Optional.of(published));
        when(skills.listPublishedReleases("000000", 200)).thenReturn(List.of(published));
        SkillRuntimeService service = new SkillRuntimeService(devices, resolver, skills);

        assertThat(service.skills(CONTEXT).skills()).containsExactly(published);
        assertThat(service.artifact(CONTEXT, 9001)).isEqualTo(published);
    }

    @Test
    void rejectsRevokedArtifact() {
        DeviceService devices = mock(DeviceService.class);
        SkillStore skills = mock(SkillStore.class);
        EffectiveSkillResolver resolver = new EffectiveSkillResolver(skills, mock(BootstrapRevisionStore.class));
        when(devices.requireActive(CONTEXT)).thenReturn(activeDevice());
        when(skills.findRelease("000000", 9001L)).thenReturn(java.util.Optional.of(release(SkillRelease.Status.REVOKED)));
        SkillRuntimeService service = new SkillRuntimeService(devices, resolver, skills);

        assertThatThrownBy(() -> service.artifact(CONTEXT, 9001))
            .isInstanceOf(RuntimeException.class);
    }

    private static SkillRelease release(SkillRelease.Status status) {
        return new SkillRelease(9001, "000000", "code-review", "1.0.0", "Review", "MIT", "OwnDsh",
            true, true, List.of("dev"), 1024,
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", status, 0);
    }

    private static EnterpriseDevice activeDevice() {
        return new EnterpriseDevice(
            401, "000000", 101, "alice", "Alice",
            UUID.fromString("123e4567-e89b-42d3-a456-426614174010"), "Mac", "darwin-arm64",
            "1", "1", DeviceStatus.ACTIVE, Instant.EPOCH, null, 0
        );
    }
}
