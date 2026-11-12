/**
 * [INPUT]: 依赖真实 Console Controller、同源上下文解析器、应用授权和加密 cursor，平台会话与存储端口提供已知事实。
 * [OUTPUT]: 验证浏览器本人列表、跨会话 cursor 拒绝、Host pin、外站写拒绝及登录退出边界。
 * [POS]: remote 的 Console HTTP 验收，不借用管理员权限或伪造 Harness installation。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.auth.EnterpriseIdentityProperties;
import com.owndsh.enterprise.auth.application.AuthFlowException;
import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.application.PlatformSessionGateway;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.auth.web.OwnDshIdentityAdminRequestContextResolver;
import com.owndsh.enterprise.common.api.EnterpriseCursorCodec;
import com.owndsh.enterprise.common.api.EnterpriseExceptionHandler;
import com.owndsh.enterprise.common.api.EnterpriseRequestIdFilter;
import com.owndsh.enterprise.crypto.SecretCipher;
import com.owndsh.enterprise.device.domain.DeviceStatus;
import com.owndsh.enterprise.remote.application.RemoteControlService;
import com.owndsh.enterprise.remote.domain.RemoteDeviceSnapshot;
import com.owndsh.enterprise.remote.persistence.RemoteDeviceStore;
import com.owndsh.enterprise.remote.web.ConsoleRemoteController;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

@Tag("dev")
class RemoteConsoleApiTest {
    private static final String TENANT = "000000";
    private static final long OWNER = 42;
    private static final String SESSION = "admin-123e4567-e89b-42d3-a456-426614174000";
    private static final String KEY = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[32]);
    private static final JsonMapper JSON = JsonMapper.builder().findAndAddModules().build();
    private PlatformSessionGateway sessions;
    private RemoteDeviceStore devices;
    private MockMvc mvc;
    private RemoteGateway gateway;

    @BeforeEach
    void setup() {
        sessions = mock(PlatformSessionGateway.class);
        when(sessions.current()).thenReturn(console(OWNER, SESSION));
        devices = mock(RemoteDeviceStore.class);
        RemoteRedisStateStore redis = mock(RemoteRedisStateStore.class);
        when(redis.issueTicket(anyString(), anyString(), anyString(), anyString(), anyString(), any()))
            .thenAnswer(invocation -> invocation.getArgument(4));
        when(redis.read("remote:presence:2")).thenReturn(Optional.of("{\"state\":\"READY\",\"remoteEnabled\":true,\"hostPublicKey\":\"" + KEY + "\"}"));
        when(devices.find(eq(TENANT), eq(2L), any())).thenReturn(Optional.of(device(2, OWNER)));
        when(devices.find(eq(TENANT), eq(4L), any())).thenReturn(Optional.of(device(4, 43)));
        when(devices.identityPublicKey(TENANT, 2L)).thenReturn(Optional.of(KEY));
        when(devices.listOwned(eq(TENANT), eq(OWNER), isNull(), anyLong(), anyInt(), any()))
            .thenReturn(List.of(device(2, OWNER), device(3, OWNER)));
        EnterpriseIdentityProperties properties = new EnterpriseIdentityProperties();
        properties.setTenantId(TENANT);
        RemoteControlService remote = new RemoteControlService(devices, redis, JSON, new RemoteNettyProperties());
        gateway = mock(RemoteGateway.class);
        when(gateway.currentConnection("2")).thenReturn(Optional.empty());
        mvc = standaloneSetup(new ConsoleRemoteController(remote, sessions,
            new OwnDshIdentityAdminRequestContextResolver(properties, sessions),
            new EnterpriseCursorCodec(new SecretCipher(new byte[32])), gateway))
            .setControllerAdvice(new EnterpriseExceptionHandler()).addFilters(new EnterpriseRequestIdFilter()).build();
    }

    @Test
    void listsOwnedDevicesWithoutInstallationOrManagementPermissionAndScopesCursorToLogin() throws Exception {
        String response = mvc.perform(get("/enterprise/console/v1/remote/devices").param("limit", "1"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andReturn().getResponse().getContentAsString();
        var data = JSON.readTree(response).path("data");
        assertThat(data.path("items").size()).isEqualTo(1);
        assertThat(data.path("items").get(0).path("deviceId").asText()).isEqualTo("2");
        assertThat(data.path("items").get(0).has("hostPublicKey")).isFalse();
        assertThat(data.path("page").path("hasMore").asBoolean()).isTrue();
        String cursor = data.path("page").path("nextCursor").asText();
        when(sessions.current()).thenReturn(console(OWNER, "admin-" + UUID.randomUUID()));
        mvc.perform(get("/enterprise/console/v1/remote/devices").param("cursor", cursor)).andExpect(status().isBadRequest());
        when(sessions.current()).thenReturn(console(43, SESSION));
        mvc.perform(get("/enterprise/console/v1/remote/devices").param("cursor", cursor)).andExpect(status().isBadRequest());
        verify(devices, never()).list(anyString(), anyLong(), anyInt(), any());
    }

    @Test
    void returnsPinnedTicketAndRejectsOtherOwnerAndForeignOrigin() throws Exception {
        String response = mvc.perform(post("/enterprise/console/v1/remote/devices/2/ticket")
            .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(body()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var data = JSON.readTree(response).path("data");
        assertThat(data.propertyNames()).containsExactlyInAnyOrder("ticket", "linkId", "deviceId", "expiresAt", "iceServers", "hostPublicKey");
        assertThat(data.path("hostPublicKey").asText()).isEqualTo(KEY);
        mvc.perform(post("/enterprise/console/v1/remote/devices/4/ticket")
            .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(body()))
            .andExpect(status().isForbidden());
        mvc.perform(post("/enterprise/console/v1/remote/devices/2/ticket").header("Origin", "https://evil.example")
            .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(body()))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsHarnessAndLoggedOutSessions() throws Exception {
        when(sessions.current()).thenReturn(new PlatformSession(OWNER, PlatformClient.DSH_DESKTOP, "harness", UUID.randomUUID().toString()));
        mvc.perform(get("/enterprise/console/v1/remote/devices")).andExpect(status().isUnauthorized());
        when(sessions.current()).thenThrow(new AuthFlowException("ENT_AUTH_REQUIRED"));
        mvc.perform(get("/enterprise/console/v1/remote/devices")).andExpect(status().isUnauthorized());
    }

    @Test
    void ownerCanInspectAndDisconnectWithoutManagementRole() throws Exception {
        String linkId = "rln_01ARZ3NDEKTSV4RRFFQ69G5FAV";
        when(gateway.currentConnection("2")).thenReturn(Optional.of(linkId));
        String response = mvc.perform(get("/enterprise/console/v1/remote/devices/2/connection"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andReturn().getResponse().getContentAsString();
        assertThat(JSON.readTree(response).path("data").path("linkId").asText()).isEqualTo(linkId);
        String disconnected = mvc.perform(post("/enterprise/console/v1/remote/devices/2/connection/disconnect")
            .contentType(MediaType.APPLICATION_JSON).content("{\"expectedLinkId\":\"" + linkId + "\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(JSON.readTree(disconnected).path("data").has("linkId")).isTrue();
        assertThat(JSON.readTree(disconnected).path("data").path("linkId").isNull()).isTrue();
        verify(gateway).disconnect("2", linkId);
        when(gateway.currentConnection("2")).thenReturn(Optional.empty());
        assertThat(JSON.readTree(mvc.perform(get("/enterprise/console/v1/remote/devices/2/connection"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data").path("linkId").isNull()).isTrue();
    }

    @Test
    void connectionActionsRejectForeignOwnerUnknownDeviceOriginAndInvalidInput() throws Exception {
        String body = "{\"expectedLinkId\":\"rln_01ARZ3NDEKTSV4RRFFQ69G5FAV\"}";
        for (String id : List.of("4", "5")) {
            int expectedStatus = id.equals("4") ? 403 : 404;
            mvc.perform(get("/enterprise/console/v1/remote/devices/" + id + "/connection"))
                .andExpect(status().is(expectedStatus));
            mvc.perform(post("/enterprise/console/v1/remote/devices/" + id + "/connection/disconnect")
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().is(expectedStatus));
            verify(gateway, never()).currentConnection(id);
            verify(gateway, never()).disconnect(eq(id), anyString());
        }
        mvc.perform(post("/enterprise/console/v1/remote/devices/2/connection/disconnect")
            .header("Origin", "https://evil.example").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isUnauthorized());
        for (String invalid : List.of("{}", "{\"expectedLinkId\":null}", "{\"expectedLinkId\":\"bad\"}")) {
            mvc.perform(post("/enterprise/console/v1/remote/devices/2/connection/disconnect")
                .contentType(MediaType.APPLICATION_JSON).content(invalid)).andExpect(status().isBadRequest());
        }
        verify(gateway, never()).disconnect(eq("2"), anyString());
    }

    @Test
    void changedConnectionIsConflictAndLoggedOutActionsAreUnauthorized() throws Exception {
        String linkId = "rln_01ARZ3NDEKTSV4RRFFQ69G5FAV";
        String body = "{\"expectedLinkId\":\"" + linkId + "\"}";
        doThrow(new com.owndsh.enterprise.remote.domain.RemoteControlException("ENT_REMOTE_BUSY"))
            .when(gateway).disconnect("2", linkId);
        String response = mvc.perform(post("/enterprise/console/v1/remote/devices/2/connection/disconnect")
            .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict())
            .andReturn().getResponse().getContentAsString();
        assertThat(JSON.readTree(response).path("error").path("code").asText()).isEqualTo("ENT_REMOTE_BUSY");
        when(sessions.current()).thenThrow(new AuthFlowException("ENT_AUTH_REQUIRED"));
        mvc.perform(get("/enterprise/console/v1/remote/devices/2/connection")).andExpect(status().isUnauthorized());
        mvc.perform(post("/enterprise/console/v1/remote/devices/2/connection/disconnect")
            .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized());
    }

    private static String body() {
        return "{\"controllerDeviceId\":\"ctl_01ARZ3NDEKTSV4RRFFQ69G5FAV\",\"controllerPublicKey\":\"" + KEY
            + "\",\"requestedCapabilities\":[\"remote.connect\"],\"clientVersion\":\"console/0.1.0\"}";
    }

    private static PlatformSession console(long owner, String sessionId) {
        return new PlatformSession(owner, PlatformClient.ENTERPRISE_ADMIN, "console", sessionId);
    }

    private static RemoteDeviceSnapshot device(long id, long owner) {
        return new RemoteDeviceSnapshot(id, TENANT, owner, UUID.randomUUID(), "Owned machine", "linux-amd64", DeviceStatus.ACTIVE,
            true, true, List.of("remote.connect"), List.of("relay"), 1, Instant.now(), 0);
    }
}
