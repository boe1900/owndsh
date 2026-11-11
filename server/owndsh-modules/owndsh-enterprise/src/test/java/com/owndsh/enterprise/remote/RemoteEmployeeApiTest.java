/**
 * [INPUT]: 依赖真实员工 Controller、应用授权、MockMvc 与加密 cursor，存储端口按已知身份提供事实。
 * [OUTPUT]: 验证 Bearer/员工/安装入口、用户 cursor 隔离和新旧 ticket JSON 形状。
 * [POS]: remote HTTP 边界测试，数据库所有权和原子性由 RemoteControlServiceIntegrationTest 覆盖。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.common.api.EnterpriseCursorCodec;
import com.owndsh.enterprise.common.api.EnterpriseExceptionHandler;
import com.owndsh.enterprise.common.api.EnterpriseRequestIdFilter;
import com.owndsh.enterprise.crypto.SecretCipher;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.domain.DeviceStatus;
import com.owndsh.enterprise.remote.application.RemoteControlService;
import com.owndsh.enterprise.remote.domain.RemoteDeviceSnapshot;
import com.owndsh.enterprise.remote.persistence.RemoteDeviceStore;
import com.owndsh.enterprise.remote.web.EmployeeRemoteController;
import com.owndsh.enterprise.remote.web.RemoteController;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

@Tag("dev")
class RemoteEmployeeApiTest {
    private static final String TENANT = "000000";
    private static final long OWNER = 42L;
    private static final UUID INSTALLATION = UUID.fromString("123e4567-e89b-42d3-a456-426614174000");
    private static final String KEY = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[32]);
    private static final JsonMapper JSON = JsonMapper.builder().findAndAddModules().build();
    private RemoteDeviceStore devices;
    private DeviceCallContext context;
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        devices = mock(RemoteDeviceStore.class);
        RemoteRedisStateStore redis = mock(RemoteRedisStateStore.class);
        when(redis.issueTicket(anyString(), anyString(), anyString(), anyString(), anyString(), any())).thenAnswer(invocation -> invocation.getArgument(4));
        when(redis.read("remote:presence:2")).thenReturn(Optional.of("{\"state\":\"READY\",\"remoteEnabled\":true,\"hostPublicKey\":\"" + KEY + "\"}"));
        RemoteControlService remote = new RemoteControlService(devices, redis, JSON, new RemoteNettyProperties());
        EnterpriseCursorCodec cursors = new EnterpriseCursorCodec(new SecretCipher(new byte[32]));
        context = employee(OWNER, INSTALLATION);
        when(devices.findByInstallation(eq(TENANT), eq(INSTALLATION), any())).thenReturn(Optional.of(device(1, OWNER, INSTALLATION, DeviceStatus.ACTIVE)));
        when(devices.find(eq(TENANT), eq(2L), any())).thenReturn(Optional.of(device(2, OWNER, UUID.randomUUID(), DeviceStatus.ACTIVE)));
        when(devices.identityPublicKey(TENANT, 2L)).thenReturn(Optional.of(KEY));
        when(devices.listOwned(eq(TENANT), eq(OWNER), eq(INSTALLATION), anyLong(), anyInt(), any()))
            .thenReturn(List.of(device(2, OWNER, UUID.randomUUID(), DeviceStatus.ACTIVE), device(3, OWNER, UUID.randomUUID(), DeviceStatus.ACTIVE)));
        mvc = standaloneSetup(new EmployeeRemoteController(remote, request -> context, cursors),
            new RemoteController(remote, request -> new EnterpriseRequestContext(TENANT, OWNER, "req_remote_http", null, null), cursors))
            .setControllerAdvice(new EnterpriseExceptionHandler()).addFilters(new EnterpriseRequestIdFilter()).build();
    }

    @Test
    void servesOwnedDeviceItemsWithoutPublishingKeysAndRejectsCrossOwnerCursor() throws Exception {
        String response = mvc.perform(get("/enterprise/api/v1/remote/devices").header("Authorization", "Bearer fixture").param("limit", "1"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode data = JSON.readTree(response).path("data");
        assertThat(data.path("items").size()).isEqualTo(1);
        assertThat(data.path("items").get(0).path("deviceId").asText()).isEqualTo("2");
        assertThat(data.path("items").get(0).has("hostPublicKey")).isFalse();
        assertThat(data.path("page").path("hasMore").asBoolean()).isTrue();
        String cursor = data.path("page").path("nextCursor").asText();
        UUID otherInstallation = UUID.randomUUID();
        context = employee(43, otherInstallation);
        when(devices.findByInstallation(eq(TENANT), eq(otherInstallation), any())).thenReturn(Optional.of(device(4, 43, otherInstallation, DeviceStatus.ACTIVE)));
        mvc.perform(get("/enterprise/api/v1/remote/devices").header("Authorization", "Bearer fixture").param("cursor", cursor))
            .andExpect(status().isBadRequest());
    }

    @Test
    void rejectsMissingBearerConsoleSessionAndRevokedInstallation() throws Exception {
        mvc.perform(get("/enterprise/api/v1/remote/devices")).andExpect(status().isUnauthorized());
        context = new DeviceCallContext(TENANT, new PlatformSession(OWNER, PlatformClient.ENTERPRISE_ADMIN, "console", "console"), "req_remote_http", null, null);
        mvc.perform(get("/enterprise/api/v1/remote/devices").header("Authorization", "Bearer fixture")).andExpect(status().isForbidden());
        context = employee(OWNER, INSTALLATION);
        when(devices.findByInstallation(eq(TENANT), eq(INSTALLATION), any())).thenReturn(Optional.of(device(1, OWNER, INSTALLATION, DeviceStatus.REVOKED)));
        mvc.perform(get("/enterprise/api/v1/remote/devices").header("Authorization", "Bearer fixture")).andExpect(status().isForbidden());
    }

    @Test
    void addsHostPublicKeyOnlyToEmployeeTicketResponse() throws Exception {
        String body = "{\"controllerDeviceId\":\"ctl_01ARZ3NDEKTSV4RRFFQ69G5FAV\",\"controllerPublicKey\":\"" + KEY
            + "\",\"requestedCapabilities\":[\"remote.connect\"],\"clientVersion\":\"plugin/0.1.0\"}";
        for (String namespace : List.of("api", "admin")) {
            String raw = mvc.perform(post("/enterprise/" + namespace + "/v1/remote/devices/2/ticket")
                .header("Authorization", "Bearer fixture").header("Idempotency-Key", UUID.randomUUID())
                .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            JsonNode data = JSON.readTree(raw).path("data");
            assertThat(data.propertyNames()).contains("ticket", "linkId", "deviceId", "expiresAt", "iceServers");
            if (namespace.equals("api")) {
                assertThat(data.propertyNames()).hasSize(6);
                assertThat(data.path("hostPublicKey").asText()).isEqualTo(KEY);
            } else {
                assertThat(data.propertyNames()).hasSize(5);
                assertThat(data.has("hostPublicKey")).isFalse();
            }
        }
    }

    private static DeviceCallContext employee(long owner, UUID installation) {
        return new DeviceCallContext(TENANT, new PlatformSession(owner, PlatformClient.DSH_DESKTOP, "harness", installation.toString()), "req_remote_http", null, null);
    }

    private static RemoteDeviceSnapshot device(long id, long owner, UUID installation, DeviceStatus status) {
        return new RemoteDeviceSnapshot(id, TENANT, owner, installation, "Owned machine", "linux-amd64", status,
            true, true, List.of("remote.connect"), List.of("relay"), 1, Instant.now(), 0);
    }
}
