/**
 * [INPUT]: 依赖升级前的十字段 Redis JSON、RemoteTicketState 与生产使用的 Jackson record 反序列化。
 * [OUTPUT]: 验证旧 Harness 状态缺少来源字段仍可读取，Console 状态不会被写成 installation。
 * [POS]: remote 的短期 Redis 升级兼容门禁，保护滚动更新期间既有 ticket/link。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.remote.domain.RemoteTicketState;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class RemoteTicketStateTest {
    private static final JsonMapper JSON = JsonMapper.builder().findAndAddModules().build();
    private static final String LEGACY = """
        {"tenantId":"tenant-a","actorId":"2001100000000000003","deviceId":"9001001",
         "linkId":"rln_01ARZ3NDEKTSV4RRFFQ69G5FAV","controllerDeviceId":"ctl_01ARZ3NDEKTSV4RRFFQ69G5FAV",
         "controllerPublicKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
         "controllerInstallationId":"123e4567-e89b-42d3-a456-426614174000",
         "hostPublicKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
         "requestedCapabilities":["remote.connect"],"expiresAt":"2026-11-12T00:00:10Z"}
        """;

    @Test
    void readsExistingHarnessTicketWithoutControllerSourceFields() throws Exception {
        RemoteTicketState state = JSON.readValue(LEGACY, RemoteTicketState.class);
        assertThat(state.controllerKind()).isEqualTo(RemoteTicketState.ControllerKind.HARNESS);
        assertThat(state.controllerInstallationId()).isEqualTo("123e4567-e89b-42d3-a456-426614174000");
        assertThat(state.controllerSessionId()).isNull();
        assertThat(state.actorId()).isEqualTo(2_001_100_000_000_000_003L);
    }

    @Test
    void rejectsConsoleStateThatStillCarriesAnInstallation() {
        var invalid = JSON.readTree(LEGACY).deepCopy();
        ((tools.jackson.databind.node.ObjectNode) invalid).put("controllerKind", "CONSOLE")
            .put("controllerSessionId", "admin-123e4567-e89b-42d3-a456-426614174001");
        assertThatThrownBy(() -> JSON.treeToValue(invalid, RemoteTicketState.class))
            .hasRootCauseInstanceOf(IllegalArgumentException.class);
    }
}
