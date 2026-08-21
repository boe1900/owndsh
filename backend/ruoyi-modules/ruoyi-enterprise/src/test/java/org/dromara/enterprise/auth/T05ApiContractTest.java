/**
 * [INPUT]: 依赖 T05 auth/device Controllers、真实设备上下文解析器、MockMvc、认证 cursor、统一异常/filter 与派生 JSON Schema。
 * [OUTPUT]: 验证七个认证、HTML 密码失败、JSON 两阶段改密、设备 operation、撤销翻译和权限入口。
 * [POS]: T05 Server/OpenAPI 同步门禁，Application Service 使用 mock 以隔离协议与 redirect 行为。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.networknt.schema.InputFormat;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;
import org.dromara.enterprise.auth.application.AuthSources;
import org.dromara.enterprise.auth.application.AuthFlowException;
import org.dromara.enterprise.auth.application.PlatformAuthorizationService;
import org.dromara.enterprise.auth.application.PlatformSessionGateway;
import org.dromara.enterprise.auth.application.PlatformSessionRevokedException;
import org.dromara.enterprise.auth.application.PasswordChangeRequiredException;
import org.dromara.enterprise.auth.application.PublicIdentitySource;
import org.dromara.enterprise.auth.application.TokenExchangeResult;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.web.PlatformAuthController;
import org.dromara.enterprise.common.api.EnterpriseCursorCodec;
import org.dromara.enterprise.common.api.EnterpriseExceptionHandler;
import org.dromara.enterprise.common.api.EnterpriseRequestIdFilter;
import org.dromara.enterprise.crypto.SecretCipher;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.device.application.DeviceService;
import org.dromara.enterprise.device.domain.DeviceStatus;
import org.dromara.enterprise.device.domain.EnterpriseDevice;
import org.dromara.enterprise.device.web.AdminDeviceController;
import org.dromara.enterprise.device.web.DeviceRequestContextResolver;
import org.dromara.enterprise.device.web.RuntimeDeviceController;
import org.dromara.enterprise.device.web.RuoYiDeviceRequestContextResolver;
import org.dromara.enterprise.auth.application.PlatformSession;
import org.dromara.enterprise.auth.domain.PlatformClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.lang.reflect.Method;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

@Tag("dev")
class T05ApiContractTest {
    private static final String TRANSACTION = "tx_01J5T05PKCEDEVICELOGIN0000000";
    private static final String INSTALLATION = "123e4567-e89b-42d3-a456-426614174000";
    private static final String DEVICE_ID = "1900200000000000001";
    private static final SchemaRegistry SCHEMAS =
        SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12);
    private static final Path CONTRACT_ROOT = findContractRoot();

    private PlatformAuthorizationService authorization;
    private DeviceService devices;
    private MockMvc mvc;
    private EnterpriseDevice device;

    @BeforeEach
    void setUp() {
        authorization = mock(PlatformAuthorizationService.class);
        devices = mock(DeviceService.class);
        EnterpriseIdentityProperties properties = new EnterpriseIdentityProperties();
        properties.setTenantId("000000");
        EnterpriseCursorCodec cursors = new EnterpriseCursorCodec(new SecretCipher(new byte[32]));
        DeviceRequestContextResolver contexts = request -> request.getRequestURI().contains("/admin/")
            ? adminContext()
            : harnessContext();
        device = device();
        mvc = standaloneSetup(
            new PlatformAuthController(authorization, properties),
            new RuntimeDeviceController(devices, contexts),
            new AdminDeviceController(devices, contexts, cursors)
        ).setControllerAdvice(new EnterpriseExceptionHandler())
            .addFilters(new EnterpriseRequestIdFilter())
            .build();

        when(authorization.authorize(any(), any(), anyString(), anyString(), anyString(), any()))
            .thenReturn(TRANSACTION);
        when(authorization.sources("000000", TRANSACTION)).thenReturn(new AuthSources(
            TRANSACTION,
            "csrf_01J5T05PKCEDEVICELOGIN00000",
            List.of(new PublicIdentitySource(1900100000000000001L, "Local", IdentitySourceType.LOCAL))
        ));
        when(authorization.password(
            anyString(), anyString(), anyLong(), anyString(), anyString(), any(char[].class),
            anyString(), anyString(), any()
        )).thenReturn(URI.create("http://127.0.0.1:18080/callback?code=code&state=client-state-0001"));
        when(authorization.changeInitialPassword(
            anyString(), anyString(), anyLong(), anyString(), anyString(), any(char[].class), any()
        )).thenReturn(URI.create("http://127.0.0.1:18080/callback?code=code&state=client-state-0001"));
        when(authorization.startOidc(anyString(), anyString(), anyLong()))
            .thenReturn(URI.create("https://idp.example/authorize"));
        when(authorization.oidcCallback(anyString(), anyLong(), anyString(), anyString(), any()))
            .thenReturn(URI.create("https://admin.example/auth/callback?code=code&state=client-state-0001"));
        when(authorization.exchange(anyString(), any(), any(), anyString(), any()))
            .thenReturn(new TokenExchangeResult("fixture-sa-token-value-not-a-secret", "Bearer", 43_200, "dsh-desktop"));
        doNothing().when(authorization).logout(anyString(), any());
        when(devices.enroll(any(), any())).thenReturn(device);
        when(devices.heartbeat(any(), any())).thenReturn(device);
        when(devices.list(any(), anyLong(), anyInt())).thenReturn(List.of(device));
        when(devices.get(any(), anyLong())).thenReturn(device);
        when(devices.revoke(any(), anyLong(), anyLong())).thenReturn(revokedDevice());
    }

    @Test
    void completesInitialPasswordChangeWithoutRepeatingCredentials() throws Exception {
        when(authorization.password(
            anyString(), anyString(), anyLong(), anyString(), anyString(), any(char[].class),
            anyString(), anyString(), any()
        )).thenThrow(new PasswordChangeRequiredException(
            "pwc_abcdefghijklmnopqrstuvwxyzABCDEFGH123456789", false
        ));

        mvc.perform(post("/enterprise/auth/v1/password")
                .secure(true)
                .accept(MediaType.TEXT_HTML)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("transactionId", TRANSACTION)
                .param("sourceId", "1900100000000000001")
                .param("csrfToken", "csrf_01J5T05PKCEDEVICELOGIN00000")
                .param("username", "platform.admin")
                .param("password", "not-logged")
                .param("captchaId", "captcha-uuid")
                .param("captchaCode", "12"))
            .andExpect(status().isBadRequest());

        mvc.perform(post("/enterprise/auth/v1/password")
                .secure(true)
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("transactionId", TRANSACTION)
                .param("sourceId", "1900100000000000001")
                .param("csrfToken", "csrf_01J5T05PKCEDEVICELOGIN00000")
                .param("username", "platform.admin")
                .param("password", "not-logged")
                .param("captchaId", "captcha-uuid")
                .param("captchaCode", "12"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.data.next").value("CHANGE_PASSWORD"))
            .andExpect(jsonPath("$.data.passwordChangeChallenge")
                .value("pwc_abcdefghijklmnopqrstuvwxyzABCDEFGH123456789"));

        mvc.perform(post("/enterprise/auth/v1/password")
                .secure(true)
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("transactionId", TRANSACTION)
                .param("sourceId", "1900100000000000001")
                .param("csrfToken", "csrf_01J5T05PKCEDEVICELOGIN00000")
                .param("passwordChangeChallenge", "pwc_abcdefghijklmnopqrstuvwxyzABCDEFGH123456789")
                .param("newPassword", "Replacement!Password42"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.next").value("REDIRECT"))
            .andExpect(jsonPath("$.data.redirectUri")
                .value("http://127.0.0.1:18080/callback?code=code&state=client-state-0001"));
    }

    @Test
    void keepsHtmlPasswordFailureOnTheLoginPageAndPreservesJsonErrors() throws Exception {
        when(authorization.password(
            anyString(), anyString(), anyLong(), anyString(), anyString(), any(char[].class),
            anyString(), anyString(), any()
        )).thenThrow(new AuthFlowException("ENT_AUTH_REQUIRED"));

        mvc.perform(post("/enterprise/auth/v1/password")
                .secure(true)
                .accept(MediaType.TEXT_HTML)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("transactionId", TRANSACTION)
                .param("sourceId", "1900100000000000001")
                .param("csrfToken", "csrf_01J5T05PKCEDEVICELOGIN00000")
                .param("username", "platform.admin")
                .param("password", "not-logged")
                .param("captchaId", "captcha-uuid")
                .param("captchaCode", "wrong"))
            .andExpect(status().isSeeOther())
            .andExpect(redirectedUrl(
                "/enterprise/auth/login.html?transaction_id=" + TRANSACTION
                    + "&source_id=1900100000000000001&login_error=1"
            ));

        mvc.perform(post("/enterprise/auth/v1/password")
                .secure(true)
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("transactionId", TRANSACTION)
                .param("sourceId", "1900100000000000001")
                .param("csrfToken", "csrf_01J5T05PKCEDEVICELOGIN00000")
                .param("username", "platform.admin")
                .param("password", "not-logged")
                .param("captchaId", "captcha-uuid")
                .param("captchaCode", "wrong"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error.code").value("ENT_AUTH_REQUIRED"));
    }

    @Test
    void servesEveryAuthenticationOperationAndGeneratedSuccessSchema() throws Exception {
        mvc.perform(get("/enterprise/auth/v1/authorize")
                .queryParam("client_id", "dsh-desktop")
                .queryParam("redirect_uri", "http://127.0.0.1:18080/callback")
                .queryParam("state", "client-state-0001")
                .queryParam("code_challenge", "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789")
                .queryParam("code_challenge_method", "S256")
                .queryParam("installation_id", INSTALLATION))
            .andExpect(status().isSeeOther())
            .andExpect(redirectedUrl("/enterprise/auth/login.html?transaction_id=" + TRANSACTION));

        assertSchema(
            mvc.perform(get("/enterprise/auth/v1/sources").queryParam("transaction_id", TRANSACTION))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(),
            "AuthSourcesResponse"
        );

        mvc.perform(post("/enterprise/auth/v1/password")
                .secure(true)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("transactionId", TRANSACTION)
                .param("sourceId", "1900100000000000001")
                .param("csrfToken", "csrf_01J5T05PKCEDEVICELOGIN00000")
                .param("username", "alice")
                .param("password", "not-logged")
                .param("captchaId", "captcha-uuid")
                .param("captchaCode", "12"))
            .andExpect(status().isSeeOther())
            .andExpect(header().string("Location", org.hamcrest.Matchers.startsWith("http://127.0.0.1:18080/callback")));

        mvc.perform(get("/enterprise/auth/v1/oidc/{sourceId}/start", "1900100000000000002")
                .queryParam("transaction_id", TRANSACTION))
            .andExpect(status().isFound())
            .andExpect(redirectedUrl("https://idp.example/authorize"));
        mvc.perform(get("/enterprise/auth/v1/oidc/{sourceId}/callback", "1900100000000000002")
                .queryParam("state", "oidc-state")
                .queryParam("code", "upstream-code"))
            .andExpect(status().isFound())
            .andExpect(redirectedUrl(
                "https://admin.example/auth/callback?code=code&state=client-state-0001"
            ));

        assertSchema(
            mvc.perform(post("/enterprise/auth/v1/token")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""
                        {
                          "grantType":"authorization_code",
                          "code":"abcdefghijklmnopqrstuvwxyzABCDEFGH123456789",
                          "clientId":"dsh-desktop",
                          "redirectUri":"http://127.0.0.1:18080/callback",
                          "codeVerifier":"0123456789abcdefghijklmnopqrstuvwxyzABCDEFG",
                          "installationId":"%s"
                        }
                        """.formatted(INSTALLATION)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(),
            "TokenResponse"
        );
        mvc.perform(post("/enterprise/auth/v1/logout"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.loggedOut").value(true));
    }

    @Test
    void servesRuntimeAndAdminDeviceContractsWithFrozenPermissions() throws Exception {
        String enroll = """
            {
              "installationId":"%s",
              "name":"Alice MacBook",
              "platform":"darwin-arm64",
              "harnessVersion":"0.2.9",
              "enterpriseBundleVersion":"0.1.0"
            }
            """.formatted(INSTALLATION);
        assertSchema(
            mvc.perform(post("/enterprise/api/v1/devices/enroll")
                    .header("X-Device-Id", "123e4567-e89b-42d3-a456-426614174099")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(enroll))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
            "DeviceResponse"
        );
        assertSchema(
            mvc.perform(post("/enterprise/api/v1/devices/heartbeat")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""
                        {
                          "harnessVersion":"0.2.9",
                          "enterpriseBundleVersion":"0.1.0",
                          "desiredRevision":8,
                          "pluginInventoryDigest":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                          "pendingSessionEvents":0,
                          "lastSuccessfulSyncAt":null
                        }
                        """))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
            "DeviceResponse"
        );
        assertSchema(
            mvc.perform(get("/enterprise/admin/v1/devices"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
            "DeviceListResponse"
        );
        assertSchema(
            mvc.perform(get("/enterprise/admin/v1/devices/{id}", DEVICE_ID))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
            "DeviceResponse"
        );
        assertSchema(
            mvc.perform(post("/enterprise/admin/v1/devices/{id}/actions/revoke", DEVICE_ID)
                    .header("If-Match", "1"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
            "DeviceResponse"
        );

        assertPermissions(AdminDeviceController.class, Map.of(
            "list", "ent:device:read",
            "get", "ent:device:read",
            "revoke", "ent:device:revoke"
        ));
    }

    @Test
    void mapsExplicitlyRevokedPlatformTokenToDeviceRevokedHttpError() throws Exception {
        PlatformSessionGateway sessions = mock(PlatformSessionGateway.class);
        when(sessions.current()).thenThrow(new PlatformSessionRevokedException());
        EnterpriseIdentityProperties properties = new EnterpriseIdentityProperties();
        properties.setTenantId("000000");
        MockMvc revokedMvc = standaloneSetup(new RuntimeDeviceController(
            devices,
            new RuoYiDeviceRequestContextResolver(properties, sessions)
        )).setControllerAdvice(new EnterpriseExceptionHandler())
            .addFilters(new EnterpriseRequestIdFilter())
            .build();

        revokedMvc.perform(post("/enterprise/api/v1/devices/enroll")
                .header("Authorization", "Bearer revoked-device-token")
                .header("X-Device-Id", "123e4567-e89b-42d3-a456-426614174099")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "installationId":"%s",
                      "name":"Alice MacBook",
                      "platform":"darwin-arm64",
                      "harnessVersion":"0.2.9",
                      "enterpriseBundleVersion":"0.1.0"
                    }
                    """.formatted(INSTALLATION)))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("ENT_DEVICE_REVOKED"))
            .andExpect(jsonPath("$.error.retryable").value(false));
    }

    private static void assertPermissions(Class<?> controller, Map<String, String> expected) {
        for (Method method : controller.getDeclaredMethods()) {
            if (expected.containsKey(method.getName())) {
                SaCheckPermission permission = method.getAnnotation(SaCheckPermission.class);
                assertThat(permission).isNotNull();
                assertThat(permission.value()).containsExactly(expected.get(method.getName()));
            }
        }
    }

    private static void assertSchema(String json, String schemaName) throws Exception {
        Schema schema = SCHEMAS.getSchema(Files.readString(
            CONTRACT_ROOT.resolve("generated/schemas/" + schemaName + ".schema.json")
        ));
        assertThat(schema.validate(json, InputFormat.JSON)).isEmpty();
    }

    private static DeviceCallContext harnessContext() {
        return new DeviceCallContext(
            "000000",
            new PlatformSession(
                1761100000000000003L, PlatformClient.DSH_DESKTOP, "harness", INSTALLATION
            ),
            "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "127.0.0.1", new byte[32]
        );
    }

    private static DeviceCallContext adminContext() {
        return new DeviceCallContext(
            "000000",
            new PlatformSession(
                1761100000000000001L, PlatformClient.ENTERPRISE_ADMIN, "admin-web", "admin-session-1"
            ),
            "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "127.0.0.1", new byte[32]
        );
    }

    private static EnterpriseDevice device() {
        return new EnterpriseDevice(
            Long.parseLong(DEVICE_ID), "000000", 1761100000000000003L,
            "alice", "Alice", UUID.fromString(INSTALLATION), "Alice MacBook", "darwin-arm64",
            "0.2.9", "0.1.0", DeviceStatus.ACTIVE,
            Instant.parse("2026-08-18T08:00:00Z"), null, 1
        );
    }

    private static EnterpriseDevice revokedDevice() {
        EnterpriseDevice value = device();
        return new EnterpriseDevice(
            value.id(), value.tenantId(), value.userId(), value.username(), value.displayName(),
            value.installationId(), value.name(), value.platform(), value.harnessVersion(),
            value.enterpriseBundleVersion(), DeviceStatus.REVOKED, value.lastSeenAt(),
            Instant.parse("2026-08-18T09:00:00Z"), 2
        );
    }

    private static Path findContractRoot() {
        String multiModuleRoot = System.getProperty("maven.multiModuleProjectDirectory");
        Path backendRoot = multiModuleRoot == null
            ? Path.of(System.getProperty("basedir")).resolve("../..").normalize()
            : Path.of(multiModuleRoot);
        return backendRoot.resolve("../contracts").normalize();
    }
}
