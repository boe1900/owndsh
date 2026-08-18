/**
 * [INPUT]: 依赖 T08 四个 Controller、MockMvc、认证 cursor、requestId filter 与派生 JSON Schemas。
 * [OUTPUT]: 验证 provider/model/grant/bootstrap 全部 operation 的成功/失败协议、权限码与 secret 隔离。
 * [POS]: T08 Server/OpenAPI 同步门禁，application services 使用 mock 以隔离 HTTP 翻译。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.networknt.schema.InputFormat;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;
import org.dromara.enterprise.auth.application.PlatformSession;
import org.dromara.enterprise.auth.domain.PlatformClient;
import org.dromara.enterprise.auth.web.EnterpriseRequestContext;
import org.dromara.enterprise.auth.web.IdentityAdminRequestContextResolver;
import org.dromara.enterprise.common.api.EnterpriseCursorCodec;
import org.dromara.enterprise.common.api.EnterpriseExceptionHandler;
import org.dromara.enterprise.common.api.EnterpriseRequestIdFilter;
import org.dromara.enterprise.common.api.EnterpriseRequestIds;
import org.dromara.enterprise.crypto.EncryptedSecret;
import org.dromara.enterprise.crypto.SecretCipher;
import org.dromara.enterprise.device.application.DeviceAccessException;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.device.domain.DeviceStatus;
import org.dromara.enterprise.device.domain.EnterpriseDevice;
import org.dromara.enterprise.device.web.DeviceRequestContextResolver;
import org.dromara.enterprise.model.application.BootstrapService;
import org.dromara.enterprise.model.application.BootstrapUser;
import org.dromara.enterprise.model.application.EffectiveModelResolver;
import org.dromara.enterprise.model.application.ManagedModelService;
import org.dromara.enterprise.model.application.ModelGrantService;
import org.dromara.enterprise.model.application.ModelResourceNotFoundException;
import org.dromara.enterprise.model.application.ProviderProbe;
import org.dromara.enterprise.model.application.ProviderSecretInput;
import org.dromara.enterprise.model.application.ProviderService;
import org.dromara.enterprise.model.domain.GrantSubjectType;
import org.dromara.enterprise.model.domain.ManagedModel;
import org.dromara.enterprise.model.domain.ModelGrant;
import org.dromara.enterprise.model.domain.ModelProvider;
import org.dromara.enterprise.model.domain.ModelStatus;
import org.dromara.enterprise.model.domain.ProviderType;
import org.dromara.enterprise.model.web.AdminManagedModelController;
import org.dromara.enterprise.model.web.AdminModelGrantController;
import org.dromara.enterprise.model.web.AdminProviderController;
import org.dromara.enterprise.model.web.BootstrapController;
import org.dromara.enterprise.model.web.ProviderTestRequest;
import org.dromara.enterprise.model.web.ProviderWriteRequest;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

@Tag("dev")
class T08ApiContractTest {
    private static final String PROVIDER_ID = "1900800000000000001";
    private static final String MODEL_ID = "1900800000000000101";
    private static final String GRANT_ID = "1900800000000000201";
    private static final String USER_ID = "1761100000000000003";
    private static final String DEPARTMENT_ID = "1761000000000000103";
    private static final String DEVICE_ID = "1900200000000000001";
    private static final String INSTALLATION = "123e4567-e89b-42d3-a456-426614174000";
    private static final String IDEMPOTENCY_KEY = "123e4567-e89b-42d3-a456-426614174000";
    private static final String SECRET = "provider-secret-must-never-return";
    private static final SchemaRegistry SCHEMAS =
        SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12);
    private static final Path CONTRACT_ROOT = findContractRoot();

    private ProviderService providers;
    private ManagedModelService models;
    private ModelGrantService grants;
    private BootstrapService bootstrap;
    private MockMvc mvc;
    private ModelProvider provider;
    private ManagedModel model;
    private ModelGrant grant;

    @BeforeEach
    void setUp() {
        providers = mock(ProviderService.class);
        models = mock(ManagedModelService.class);
        grants = mock(ModelGrantService.class);
        bootstrap = mock(BootstrapService.class);
        provider = provider();
        model = model();
        grant = grant();

        IdentityAdminRequestContextResolver adminContexts = request -> new EnterpriseRequestContext(
            "000000", Long.parseLong(USER_ID), EnterpriseRequestIds.current(request), "127.0.0.1", new byte[32]
        );
        DeviceRequestContextResolver deviceContexts = request -> harnessContext();
        EnterpriseCursorCodec cursors = new EnterpriseCursorCodec(new SecretCipher(new byte[32]));
        mvc = standaloneSetup(
            new AdminProviderController(providers, adminContexts, cursors),
            new AdminManagedModelController(models, adminContexts, cursors),
            new AdminModelGrantController(grants, adminContexts, cursors),
            new BootstrapController(bootstrap, deviceContexts)
        ).setControllerAdvice(new EnterpriseExceptionHandler())
            .addFilters(new EnterpriseRequestIdFilter())
            .build();

        when(providers.list("000000", 0, 51)).thenReturn(List.of(provider));
        when(providers.get("000000", provider.id())).thenReturn(provider);
        when(providers.create(any(), any(), any(ProviderSecretInput.class))).thenAnswer(invocation -> {
            ProviderSecretInput input = invocation.getArgument(2);
            assertThat(new String(input.value())).isEqualTo(SECRET);
            return provider;
        });
        when(providers.update(any(), anyLong(), anyLong(), any(), anyBoolean(), nullable(ProviderSecretInput.class)))
            .thenReturn(provider);
        when(providers.setStatus(any(), anyLong(), anyLong(), any())).thenReturn(provider);
        when(providers.test(anyString(), anyLong(), any(), anyInt(), anyInt(), nullable(ProviderSecretInput.class)))
            .thenReturn(new ProviderProbe.ProviderProbeResult(true, 12, ProviderProbe.ProviderProbeCategory.SUCCESS));

        when(models.list("000000", 0, 51)).thenReturn(List.of(model));
        when(models.get("000000", model.id())).thenReturn(model);
        when(models.create(any(), any())).thenReturn(model);
        when(models.update(any(), anyLong(), anyLong(), any())).thenReturn(model);
        when(models.setStatus(any(), anyLong(), anyLong(), any())).thenReturn(model);
        doNothing().when(models).delete(any(), anyLong(), anyLong());

        when(grants.list("000000", 0, 51)).thenReturn(List.of(grant));
        when(grants.create(any(), any())).thenReturn(grant);
        when(grants.createBatch(any(), any())).thenReturn(List.of(grant));
        when(grants.update(any(), anyLong(), anyLong(), any())).thenReturn(grant);
        doNothing().when(grants).delete(any(), anyLong(), anyLong());
        when(bootstrap.load(any())).thenReturn(snapshot());
    }

    @Test
    void servesEveryProviderOperationWithoutEchoingCredential() throws Exception {
        assertSchema(response(get("/enterprise/admin/v1/providers"), 200), "ProviderListResponse");
        assertSchema(response(get("/enterprise/admin/v1/providers/{id}", PROVIDER_ID), 200), "ProviderResponse");
        String created = response(post("/enterprise/admin/v1/providers")
            .header("Idempotency-Key", IDEMPOTENCY_KEY)
            .contentType(MediaType.APPLICATION_JSON)
            .content(providerRequest(false, true)), 201);
        assertSchema(created, "ProviderResponse");
        assertThat(created).doesNotContain(SECRET).doesNotContain("encryptedCredential").doesNotContain("ciphertext");
        assertSchema(response(put("/enterprise/admin/v1/providers/{id}", PROVIDER_ID)
            .header("If-Match", "0").contentType(MediaType.APPLICATION_JSON)
            .content(providerRequest(true, false)), 200), "ProviderResponse");
        assertSchema(response(post("/enterprise/admin/v1/providers/{id}/actions/test", PROVIDER_ID)
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"baseUrl":"http://127.0.0.1:18080/v1","connectTimeoutMs":5000,"readTimeoutMs":30000}
                """), 200), "ProviderProbeResponse");
        for (String action : List.of("enable", "disable")) {
            assertSchema(response(post("/enterprise/admin/v1/providers/{id}/actions/{action}", PROVIDER_ID, action)
                .header("If-Match", "0"), 200), "ProviderResponse");
        }
    }

    @Test
    void servesEveryModelAndGrantOperationWithGeneratedSchemas() throws Exception {
        assertSchema(response(get("/enterprise/admin/v1/models"), 200), "ManagedModelListResponse");
        assertSchema(response(get("/enterprise/admin/v1/models/{id}", MODEL_ID), 200), "ManagedModelResponse");
        assertSchema(response(post("/enterprise/admin/v1/models")
            .header("Idempotency-Key", IDEMPOTENCY_KEY).contentType(MediaType.APPLICATION_JSON)
            .content(modelRequest()), 201), "ManagedModelResponse");
        assertSchema(response(put("/enterprise/admin/v1/models/{id}", MODEL_ID)
            .header("If-Match", "0").contentType(MediaType.APPLICATION_JSON)
            .content(modelRequest()), 200), "ManagedModelResponse");
        for (String action : List.of("enable", "disable")) {
            assertSchema(response(post("/enterprise/admin/v1/models/{id}/actions/{action}", MODEL_ID, action)
                .header("If-Match", "0"), 200), "ManagedModelResponse");
        }
        assertSchema(response(delete("/enterprise/admin/v1/models/{id}", MODEL_ID)
            .header("If-Match", "0"), 200), "DeletedResourceResponse");

        assertSchema(response(get("/enterprise/admin/v1/model-grants"), 200), "ModelGrantListResponse");
        assertSchema(response(post("/enterprise/admin/v1/model-grants")
            .header("Idempotency-Key", IDEMPOTENCY_KEY).contentType(MediaType.APPLICATION_JSON)
            .content(grantRequest()), 201), "ModelGrantResponse");
        assertSchema(response(post("/enterprise/admin/v1/model-grants/batch")
            .header("Idempotency-Key", IDEMPOTENCY_KEY).contentType(MediaType.APPLICATION_JSON)
            .content("{\"items\":[" + grantRequest() + "]}"), 201), "ModelGrantBatchResponse");
        assertSchema(response(put("/enterprise/admin/v1/model-grants/{id}", GRANT_ID)
            .header("If-Match", "0").contentType(MediaType.APPLICATION_JSON)
            .content(grantRequest()), 200), "ModelGrantResponse");
        assertSchema(response(delete("/enterprise/admin/v1/model-grants/{id}", GRANT_ID)
            .header("If-Match", "0"), 200), "DeletedResourceResponse");
    }

    @Test
    void servesActiveDeviceBootstrapWithoutProviderRouteOrFutureSyntheticFacts() throws Exception {
        String body = response(get("/enterprise/api/v1/bootstrap"), 200);
        assertSchema(body, "BootstrapResponse");
        assertThat(body)
            .contains("deepseek-chat")
            .doesNotContain("api.deepseek")
            .doesNotContain("upstreamModel")
            .doesNotContain(SECRET);
    }

    @Test
    void servesSchemaValidFailureForEveryT08Operation() throws Exception {
        long unknownProviderId = Long.parseLong(PROVIDER_ID) + 99;
        long unknownModelId = Long.parseLong(MODEL_ID) + 99;
        when(providers.get("000000", unknownProviderId)).thenThrow(new ModelResourceNotFoundException());
        when(models.get("000000", unknownModelId)).thenThrow(new ModelResourceNotFoundException());

        assertError(get("/enterprise/admin/v1/providers").param("cursor", "invalid"), 400);
        assertError(post("/enterprise/admin/v1/providers")
            .contentType(MediaType.APPLICATION_JSON).content(providerRequest(false, true)), 400);
        assertError(get("/enterprise/admin/v1/providers/{id}", unknownProviderId), 404);
        assertError(put("/enterprise/admin/v1/providers/{id}", PROVIDER_ID)
            .contentType(MediaType.APPLICATION_JSON).content(providerRequest(true, false)), 400);
        assertError(post("/enterprise/admin/v1/providers/{id}/actions/test", PROVIDER_ID)
            .contentType(MediaType.APPLICATION_JSON).content("{"), 400);
        assertError(post("/enterprise/admin/v1/providers/{id}/actions/enable", PROVIDER_ID), 400);
        assertError(post("/enterprise/admin/v1/providers/{id}/actions/disable", PROVIDER_ID), 400);

        assertError(get("/enterprise/admin/v1/models").param("cursor", "invalid"), 400);
        assertError(post("/enterprise/admin/v1/models")
            .contentType(MediaType.APPLICATION_JSON).content(modelRequest()), 400);
        assertError(get("/enterprise/admin/v1/models/{id}", unknownModelId), 404);
        assertError(put("/enterprise/admin/v1/models/{id}", MODEL_ID)
            .contentType(MediaType.APPLICATION_JSON).content(modelRequest()), 400);
        assertError(delete("/enterprise/admin/v1/models/{id}", MODEL_ID), 400);
        assertError(post("/enterprise/admin/v1/models/{id}/actions/enable", MODEL_ID), 400);
        assertError(post("/enterprise/admin/v1/models/{id}/actions/disable", MODEL_ID), 400);

        assertError(get("/enterprise/admin/v1/model-grants").param("cursor", "invalid"), 400);
        assertError(post("/enterprise/admin/v1/model-grants")
            .contentType(MediaType.APPLICATION_JSON).content(grantRequest()), 400);
        assertError(post("/enterprise/admin/v1/model-grants/batch")
            .contentType(MediaType.APPLICATION_JSON).content("{\"items\":[" + grantRequest() + "]}"), 400);
        assertError(put("/enterprise/admin/v1/model-grants/{id}", GRANT_ID)
            .contentType(MediaType.APPLICATION_JSON).content(grantRequest()), 400);
        assertError(delete("/enterprise/admin/v1/model-grants/{id}", GRANT_ID), 400);

        when(bootstrap.load(any())).thenThrow(new DeviceAccessException("ENT_DEVICE_REVOKED"));
        assertError(get("/enterprise/api/v1/bootstrap"), 403);
    }

    @Test
    void protectsEveryManagementOperationWithFrozenPermissionCodes() {
        assertPermissions(AdminProviderController.class, Map.of(
            "list", "ent:model:read", "get", "ent:model:read", "create", "ent:model:write",
            "update", "ent:model:write", "test", "ent:model:write", "enable", "ent:model:write",
            "disable", "ent:model:write"
        ));
        assertPermissions(AdminManagedModelController.class, Map.of(
            "list", "ent:model:read", "get", "ent:model:read", "create", "ent:model:write",
            "update", "ent:model:write", "delete", "ent:model:write", "enable", "ent:model:write",
            "disable", "ent:model:write"
        ));
        assertPermissions(AdminModelGrantController.class, Map.of(
            "list", "ent:grant:read", "create", "ent:grant:write", "createBatch", "ent:grant:write",
            "update", "ent:grant:write", "delete", "ent:grant:write"
        ));
    }

    @Test
    void clearsCredentialRequestAndRedactsStringRepresentation() {
        ProviderWriteRequest request = new ProviderWriteRequest(
            "DeepSeek", ProviderType.DEEPSEEK_OPENAI, URI.create("https://api.deepseek.com/v1"),
            true, SECRET.toCharArray(), 5000, 30000
        );
        assertThat(request.toString())
            .doesNotContain(SECRET)
            .doesNotContain("api.deepseek.com")
            .contains("[REDACTED]");
        assertThatThrownBy(request::createCredential).isInstanceOf(IllegalArgumentException.class);
        request.close();
        assertThat(request.credential()).containsOnly('\0');

        try (ProviderTestRequest probe = new ProviderTestRequest(
            URI.create("https://internal.provider.test/v1"), SECRET.toCharArray(), 5000, 30000
        )) {
            assertThat(probe.toString())
                .doesNotContain(SECRET)
                .doesNotContain("internal.provider.test")
                .contains("[REDACTED]");
        }
    }

    private String response(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request, int status)
        throws Exception {
        var response = mvc.perform(request).andReturn().getResponse();
        String body = response.getContentAsString();
        assertThat(response.getStatus()).as(body).isEqualTo(status);
        return body;
    }

    private void assertError(
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request,
        int status
    ) throws Exception {
        assertSchema(response(request, status), "EnterpriseErrorResponse");
    }

    private static void assertSchema(String json, String schemaName) throws Exception {
        Schema schema = SCHEMAS.getSchema(Files.readString(
            CONTRACT_ROOT.resolve("generated/schemas/" + schemaName + ".schema.json")
        ));
        assertThat(schema.validate(json, InputFormat.JSON)).as(json).isEmpty();
    }

    private static void assertPermissions(Class<?> controller, Map<String, String> expected) {
        Map<String, String> actual = new HashMap<>();
        for (Method method : controller.getDeclaredMethods()) {
            SaCheckPermission permission = method.getAnnotation(SaCheckPermission.class);
            if (permission != null) actual.put(method.getName(), permission.value()[0]);
        }
        assertThat(actual).containsExactlyInAnyOrderEntriesOf(expected);
    }

    private static ModelProvider provider() {
        return new ModelProvider(
            Long.parseLong(PROVIDER_ID), "000000", "DeepSeek Production", ProviderType.DEEPSEEK_OPENAI,
            URI.create("https://api.deepseek.com/v1"), new EncryptedSecret(new byte[16], new byte[12], 1),
            ModelStatus.ACTIVE, 5000, 30000, 0
        );
    }

    private static ManagedModel model() {
        return new ManagedModel(
            Long.parseLong(MODEL_ID), "000000", Long.parseLong(PROVIDER_ID), "DeepSeek Production",
            "deepseek-chat", "DeepSeek Chat", "deepseek-chat", 65536, 8192, false, 10,
            ModelStatus.ACTIVE, 0
        );
    }

    private static ModelGrant grant() {
        return new ModelGrant(
            Long.parseLong(GRANT_ID), "000000", Long.parseLong(MODEL_ID), "deepseek-chat",
            GrantSubjectType.USER, Long.parseLong(USER_ID), "Alice", true, ModelStatus.ACTIVE, 0
        );
    }

    private static BootstrapService.BootstrapSnapshot snapshot() {
        EnterpriseDevice device = new EnterpriseDevice(
            Long.parseLong(DEVICE_ID), "000000", Long.parseLong(USER_ID), "alice", "Alice",
            UUID.fromString(INSTALLATION), "Alice MacBook", "darwin-arm64", "0.1.0-rc.5", "0.1.0",
            DeviceStatus.ACTIVE, Instant.parse("2026-08-18T08:00:00Z"), null, 0
        );
        return new BootstrapService.BootstrapSnapshot(
            9, new BootstrapUser(Long.parseLong(USER_ID), "alice", "Alice", Long.parseLong(DEPARTMENT_ID)),
            device,
            List.of(new EffectiveModelResolver.EffectiveModel(
                Long.parseLong(MODEL_ID), "deepseek-chat", "DeepSeek Chat", 65536, 8192, false, 10, true
            )),
            List.of()
        );
    }

    private static DeviceCallContext harnessContext() {
        return new DeviceCallContext(
            "000000",
            new PlatformSession(Long.parseLong(USER_ID), PlatformClient.DSH_DESKTOP, "harness", INSTALLATION),
            "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "127.0.0.1", new byte[32]
        );
    }

    private static String providerRequest(boolean update, boolean includeSecret) {
        return """
            {
              "name":"DeepSeek Production",
              "providerType":"DEEPSEEK_OPENAI",
              "baseUrl":"https://api.deepseek.com/v1",
              %s
              %s
              "connectTimeoutMs":5000,
              "readTimeoutMs":30000
            }
            """.formatted(
                update ? "\"replaceSecret\":false," : "",
                includeSecret ? "\"credential\":\"" + SECRET + "\"," : ""
            );
    }

    private static String modelRequest() {
        return """
            {"providerId":"%s","alias":"deepseek-chat","displayName":"DeepSeek Chat",
             "upstreamModel":"deepseek-chat","contextWindow":65536,"maxOutputTokens":8192,
             "reasoning":false,"sortOrder":10}
            """.formatted(PROVIDER_ID);
    }

    private static String grantRequest() {
        return """
            {"modelId":"%s","subjectType":"USER","subjectId":"%s","isDefault":true,"status":"ACTIVE"}
            """.formatted(MODEL_ID, USER_ID).trim();
    }

    private static Path findContractRoot() {
        String multiModuleRoot = System.getProperty("maven.multiModuleProjectDirectory");
        Path backendRoot = multiModuleRoot == null
            ? Path.of(System.getProperty("basedir")).resolve("../..").normalize()
            : Path.of(multiModuleRoot);
        return backendRoot.resolve("../contracts").normalize();
    }
}
