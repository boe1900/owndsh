/**
 * [INPUT]: 依赖插件管理/runtime Controller、MockMvc、权限注解与派生 OpenAPI schemas。
 * [OUTPUT]: 验证八个插件 operation、可选原子发布升级的请求校验与参数、完整 assignment 投影、稳定错误和权限码。
 * [POS]: T13 Server/OpenAPI 同步门禁，application services 使用 mock 以隔离 HTTP 翻译与安装配置。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.networknt.schema.InputFormat;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;
import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.auth.web.IdentityAdminRequestContextResolver;
import com.owndsh.enterprise.common.api.EnterpriseCursorCodec;
import com.owndsh.enterprise.common.api.EnterpriseExceptionHandler;
import com.owndsh.enterprise.common.api.EnterpriseRequestIdFilter;
import com.owndsh.enterprise.common.api.EnterpriseRequestIds;
import com.owndsh.enterprise.crypto.SecretCipher;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.web.DeviceRequestContextResolver;
import com.owndsh.enterprise.plugin.application.EffectivePluginResolver;
import com.owndsh.enterprise.plugin.application.PluginAccessException;
import com.owndsh.enterprise.plugin.application.PluginCatalogService;
import com.owndsh.enterprise.plugin.application.PluginRuntimeService;
import com.owndsh.enterprise.plugin.domain.DevicePluginInventory;
import com.owndsh.enterprise.plugin.domain.PluginAssignment;
import com.owndsh.enterprise.plugin.domain.PluginPackage;
import com.owndsh.enterprise.plugin.domain.PluginVersion;
import com.owndsh.enterprise.plugin.domain.PluginInstallation;
import com.owndsh.enterprise.plugin.domain.RuntimePluginAssignment;
import com.owndsh.enterprise.plugin.web.AdminPluginController;
import com.owndsh.enterprise.plugin.web.RuntimePluginController;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.lang.reflect.Method;
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
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

@Tag("dev")
class T13ApiContractTest {
    private static final long PACKAGE_ID = 1_901_300_000_000_000_101L;
    private static final long VERSION_ID = 1_901_300_000_000_000_201L;
    private static final long ASSIGNMENT_ID = 1_901_300_000_000_000_301L;
    private static final long USER_ID = 1_761_100_000_000_000_001L;
    private static final long DEVICE_ID = 1_901_300_000_000_000_401L;
    private static final String INSTALLATION = "123e4567-e89b-42d3-a456-426614174015";
    private static final String IDEMPOTENCY_KEY = "123e4567-e89b-42d3-a456-426614174000";
    private static final SchemaRegistry SCHEMAS =
        SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12);
    private static final Path CONTRACT_ROOT = findContractRoot();

    private PluginCatalogService catalog;
    private PluginRuntimeService runtime;
    private MockMvc mvc;
    private PluginVersion validated;

    @BeforeEach
    void setUp() throws Exception {
        catalog = mock(PluginCatalogService.class);
        runtime = mock(PluginRuntimeService.class);
        validated = version(PluginVersion.Status.VALIDATED, 1);
        IdentityAdminRequestContextResolver adminContexts = request -> new EnterpriseRequestContext(
            "000000", USER_ID, EnterpriseRequestIds.current(request), "127.0.0.1", new byte[32]
        );
        DeviceRequestContextResolver deviceContexts = request -> runtimeContext();
        EnterpriseCursorCodec cursors = new EnterpriseCursorCodec(new SecretCipher(new byte[32]));
        mvc = standaloneSetup(
            new AdminPluginController(catalog, adminContexts, cursors),
            new RuntimePluginController(runtime, deviceContexts)
        ).setControllerAdvice(new EnterpriseExceptionHandler())
            .addFilters(new EnterpriseRequestIdFilter())
            .build();

        when(catalog.list("000000", 0, 51)).thenReturn(List.of(
            new PluginCatalogService.CatalogItem(pluginPackage(), List.of(validated), List.of(assignment()))
        ));
        when(catalog.register(any(), anyString(), anyString(), any())).thenReturn(new PluginCatalogService.RegistrationResult(validated, true));
        when(catalog.publish(any(), anyLong(), anyLong()))
            .thenReturn(version(PluginVersion.Status.PUBLISHED, 2));
        when(catalog.retire(any(), anyLong(), anyLong()))
            .thenReturn(version(PluginVersion.Status.RETIRED, 3));
        when(catalog.replaceAssignments(any(), anyLong(), anyLong(), any()))
            .thenReturn(List.of(assignment()));
        when(catalog.listInventory("000000", 0, 51)).thenReturn(List.of(inventory()));
        when(runtime.assignments(any())).thenReturn(resolvedAssignments());
        when(runtime.replaceInventory(any(), any())).thenReturn(1);
    }

    @Test
    void servesEveryAdminPluginOperationWithSchemaValidResponses() throws Exception {
        String packages = response(get("/enterprise/admin/v1/plugins"), 200);
        assertSchema(packages, "PluginPackageListResponse");
        assertThat(JsonMapper.builder().build().readTree(packages)
            .at("/data/items/0/assignments/0/pluginVersionId").asText())
            .isEqualTo(Long.toString(VERSION_ID));

        String registered = response(registrationRequest(), 201);
        assertSchema(registered, "PluginVersionResponse");
        assertThat(registered).contains("installation").doesNotContain("signatureBase64", "sha256");
        when(catalog.register(any(), anyString(), anyString(), any())).thenReturn(new PluginCatalogService.RegistrationResult(validated, false));
        assertSchema(response(registrationRequest(), 200), "PluginVersionResponse");

        assertSchema(response(post(
            "/enterprise/admin/v1/plugins/versions/{id}/actions/publish", VERSION_ID
        ).header("If-Match", "1"), 200), "PluginVersionResponse");
        assertSchema(response(post(
            "/enterprise/admin/v1/plugins/versions/{id}/actions/retire", VERSION_ID
        ).header("If-Match", "2"), 200), "PluginVersionResponse");
        assertSchema(response(post(
            "/enterprise/admin/v1/plugins/{id}/assignments/batch", PACKAGE_ID
        ).header("Idempotency-Key", IDEMPOTENCY_KEY)
            .header("If-Match", "3")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"items":[{"pluginVersionId":"%s","subjectType":"ALL","subjectId":null,
                "desiredState":"INSTALLED","required":false}]}
                """.formatted(VERSION_ID)), 200), "PluginAssignmentBatchResponse");
        assertSchema(response(get("/enterprise/admin/v1/plugins/inventory"), 200),
            "AdminPluginInventoryListResponse");
    }

    @Test
    void publishesWithAnExplicitSourceVersionAndPackageRevision() throws Exception {
        when(catalog.publishAndUpgrade(any(), anyLong(), anyLong(), anyLong(), anyLong()))
            .thenReturn(version(PluginVersion.Status.PUBLISHED, 2));
        assertSchema(response(post("/enterprise/admin/v1/plugins/versions/{id}/actions/publish", VERSION_ID)
            .header("If-Match", "1").contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"sourceVersionId":"101","packageRevision":7}
                """), 200), "PluginVersionResponse");
        verify(catalog).publishAndUpgrade(any(), eq(VERSION_ID), eq(1L), eq(101L), eq(7L));
        for (String body : List.of("{}", "{\"sourceVersionId\":\"101\"}",
            "{\"sourceVersionId\":\"0\",\"packageRevision\":7}",
            "{\"sourceVersionId\":\"101\",\"packageRevision\":-1}")) {
            response(post("/enterprise/admin/v1/plugins/versions/{id}/actions/publish", VERSION_ID)
                .header("If-Match", "1").contentType(MediaType.APPLICATION_JSON).content(body), 400);
        }
    }

    @Test
    void servesRuntimeAssignmentsAndInventory() throws Exception {
        assertSchema(response(get("/enterprise/api/v1/plugins/assignments"), 200),
            "RuntimePluginAssignmentsResponse");
        assertSchema(response(put("/enterprise/api/v1/plugins/inventory")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"items":[{"packageName":"@example/t13-tools","version":"1.0.0",
                "desiredRevision":9,"state":"ACTIVE","loaderPhase":"active",
                "lastErrorCode":null,"observedAt":"2026-08-19T03:00:00Z"}]}
                """), 200), "PluginInventoryResponse");

    }

    @Test
    void mapsPluginValidationAndAuthorizationFailuresToStableSchemas() throws Exception {
        doThrow(new IllegalArgumentException("invalid install target")).when(catalog).register(any(), anyString(), anyString(), any());
        assertError(registrationRequest(), 400, "ENT_INVALID_REQUEST");
        doThrow(new PluginAccessException()).when(runtime).assignments(any());
        assertError(get("/enterprise/api/v1/plugins/assignments"), 403, "ENT_PLUGIN_NOT_ASSIGNED");
    }

    @Test
    void validatesPinnedTargetsAndCoreProtection() {
        for (String spec : List.of("@example/tools@1.0.0", "github:example/tools#" + "a".repeat(40) + "&path:/plugins/tools",
            "https://registry.example/tools.tgz")) {
            new PluginInstallation(spec, "Tools", "", "", "", List.of("开发", "开发"))
                .validateTarget("@example/tools", "1.0.0");
        }
        for (String spec : List.of("@example/tools@latest", "--config.foo=bar", "github:example/tools#main",
            "github:example/tools#" + "a".repeat(40) + "&path:/../private", "https://user:secret@example.test/plugin.tgz",
            "/opt/company plugins/tools.tgz", "C:\\plugins\\tools.tgz")) {
            assertThatThrownBy(() -> new PluginInstallation(spec, "Tools", "", "", "", List.of())
                .validateTarget("@example/tools", "1.0.0")).isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> new PluginInstallation("owndsh-plugin@1.0.0", "OwnDsh", "", "", "", List.of())
            .validateTarget("owndsh-plugin", "1.0.0")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void protectsEveryManagementOperationWithFrozenPermissionCodes() {
        assertPermissions(AdminPluginController.class, Map.of(
            "list", "ent:plugin:read",
            "register", "ent:plugin:write",
            "publish", "ent:plugin:write",
            "retire", "ent:plugin:write",
            "replaceAssignments", "ent:plugin:write",
            "inventory", "ent:plugin:read"
        ));
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder registrationRequest() {
        return post("/enterprise/admin/v1/plugins/versions").contentType(MediaType.APPLICATION_JSON).content("""
            {"packageName":"@example/t13-tools","version":"1.0.0","installation":{
            "spec":"@example/t13-tools@1.0.0","displayName":"Tools","description":"Review",
            "author":"Example","repositoryUrl":"https://github.com/example/plugin","categories":["开发"]}}
            """);
    }

    private String response(
        org.springframework.test.web.servlet.RequestBuilder request,
        int expectedStatus
    ) throws Exception {
        var response = mvc.perform(request).andReturn().getResponse();
        String body = response.getContentAsString();
        assertThat(response.getStatus()).as(body).isEqualTo(expectedStatus);
        return body;
    }

    private void assertError(
        org.springframework.test.web.servlet.RequestBuilder request,
        int expectedStatus,
        String code
    ) throws Exception {
        String body = response(request, expectedStatus);
        assertThat(body).contains("\"code\":\"" + code + "\"");
        assertSchema(body, "EnterpriseErrorResponse");
    }

    private static void assertSchema(String json, String schemaName) throws Exception {
        Path standalone = CONTRACT_ROOT.resolve("generated/schemas/" + schemaName + ".schema.json");
        String source;
        if (Files.isRegularFile(standalone)) {
            source = Files.readString(standalone);
        } else {
            JsonNode openApi = JsonMapper.builder().build().readTree(
                Files.readString(CONTRACT_ROOT.resolve("generated/enterprise-openapi.json"))
            );
            source = openApi.get("components").get("schemas").get(schemaName).toString();
        }
        Schema schema = SCHEMAS.getSchema(source);
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

    private static PluginPackage pluginPackage() {
        return new PluginPackage(
            PACKAGE_ID, "000000", "@example/t13-tools", "T13 Tools", PluginPackage.Status.ACTIVE, 3
        );
    }

    private static PluginVersion version(PluginVersion.Status status, long revision) {
        return new PluginVersion(
            VERSION_ID, "000000", PACKAGE_ID, "@example/t13-tools", "1.0.0",
            status, USER_ID, Instant.parse("2026-08-19T03:00:00Z"), revision, installation()
        );
    }

    private static PluginAssignment assignment() {
        return new PluginAssignment(
            ASSIGNMENT_ID, "000000", PACKAGE_ID, VERSION_ID, PluginAssignment.SubjectType.ALL, null,
            PluginAssignment.DesiredState.INSTALLED, false, PluginAssignment.Status.ACTIVE, 0
        );
    }

    private static DevicePluginInventory inventory() {
        return new DevicePluginInventory(
            1_901_300_000_000_000_501L, "000000", DEVICE_ID, "admin", "@example/t13-tools",
            "1.0.0", 9, DevicePluginInventory.State.ACTIVE, "active", null,
            Instant.parse("2026-08-19T03:00:00Z")
        );
    }

    private static EffectivePluginResolver.ResolvedAssignments resolvedAssignments() {
        return new EffectivePluginResolver.ResolvedAssignments(9, List.of(new RuntimePluginAssignment(
            VERSION_ID, "@example/t13-tools", "1.0.0", false, PluginAssignment.DesiredState.INSTALLED, installation()
        )));
    }

    private static PluginInstallation installation() {
        return new PluginInstallation("@example/t13-tools@1.0.0", "Tools", "Review", "Example", "https://github.com/example/plugin", List.of("开发"));
    }

    private static DeviceCallContext runtimeContext() {
        return new DeviceCallContext(
            "000000", new PlatformSession(USER_ID, PlatformClient.DSH_DESKTOP, "harness", INSTALLATION),
            "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "127.0.0.1", new byte[32]
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
