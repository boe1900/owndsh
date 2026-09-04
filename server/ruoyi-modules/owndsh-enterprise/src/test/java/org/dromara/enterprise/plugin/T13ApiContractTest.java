/**
 * [INPUT]: 依赖插件管理/runtime Controller、MockMvc、Range 流、权限注解与派生 OpenAPI schemas。
 * [OUTPUT]: 验证九个插件 operation、catalog 完整 assignment 投影、下载、稳定错误和固定权限码。
 * [POS]: T13 Server/OpenAPI 同步门禁，application services 使用 mock 以隔离 HTTP 翻译与二进制流。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.plugin;

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
import org.dromara.enterprise.crypto.SecretCipher;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.device.web.DeviceRequestContextResolver;
import org.dromara.enterprise.plugin.application.EffectivePluginResolver;
import org.dromara.enterprise.plugin.application.PluginAccessException;
import org.dromara.enterprise.plugin.application.PluginCatalogService;
import org.dromara.enterprise.plugin.application.PluginRuntimeService;
import org.dromara.enterprise.plugin.artifact.PluginArtifactException;
import org.dromara.enterprise.plugin.domain.DevicePluginInventory;
import org.dromara.enterprise.plugin.domain.PluginAssignment;
import org.dromara.enterprise.plugin.domain.PluginCompatibility;
import org.dromara.enterprise.plugin.domain.PluginPackage;
import org.dromara.enterprise.plugin.domain.PluginVersion;
import org.dromara.enterprise.plugin.domain.RuntimePluginAssignment;
import org.dromara.enterprise.plugin.web.AdminPluginController;
import org.dromara.enterprise.plugin.web.RuntimePluginController;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
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
    private static final String SHA256 = "a".repeat(64);
    private static final byte[] DOWNLOAD_BYTES = "0123456789".getBytes(StandardCharsets.UTF_8);
    private static final SchemaRegistry SCHEMAS =
        SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12);
    private static final Path CONTRACT_ROOT = findContractRoot();

    @TempDir
    Path temporary;

    private PluginCatalogService catalog;
    private PluginRuntimeService runtime;
    private MockMvc mvc;
    private PluginVersion validated;
    private Path artifact;

    @BeforeEach
    void setUp() throws Exception {
        catalog = mock(PluginCatalogService.class);
        runtime = mock(PluginRuntimeService.class);
        validated = version(PluginVersion.Status.VALIDATED, 1);
        artifact = temporary.resolve("artifact.tgz");
        Files.write(artifact, DOWNLOAD_BYTES);

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
        when(catalog.upload(
            any(), any(UUID.class), any(InputStream.class), any(PluginCompatibility.class)
        )).thenReturn(new PluginCatalogService.UploadResult(validated, true));
        when(catalog.publish(any(), anyLong(), anyLong()))
            .thenReturn(version(PluginVersion.Status.PUBLISHED, 2));
        when(catalog.retire(any(), anyLong(), anyLong()))
            .thenReturn(version(PluginVersion.Status.RETIRED, 3));
        when(catalog.replaceAssignments(any(), anyLong(), anyLong(), any()))
            .thenReturn(List.of(assignment()));
        when(catalog.listInventory("000000", 0, 51)).thenReturn(List.of(inventory()));
        when(runtime.assignments(any())).thenReturn(resolvedAssignments());
        when(runtime.authorizeDownload(any(), anyLong())).thenReturn(
            new PluginRuntimeService.AuthorizedDownload(artifact, DOWNLOAD_BYTES.length, SHA256)
        );
        when(runtime.replaceInventory(any(), any())).thenReturn(1);
    }

    @Test
    void servesEveryAdminPluginOperationWithSchemaValidResponses() throws Exception {
        String packages = response(get("/enterprise/admin/v1/plugins"), 200);
        assertSchema(packages, "PluginPackageListResponse");
        assertThat(JsonMapper.builder().build().readTree(packages)
            .at("/data/items/0/assignments/0/pluginVersionId").asText())
            .isEqualTo(Long.toString(VERSION_ID));

        String uploaded = response(uploadRequest(), 201);
        assertSchema(uploaded, "PluginVersionResponse");
        assertThat(uploaded).doesNotContain(artifact.toString()).doesNotContain("PRIVATE KEY");
        when(catalog.upload(
            any(), any(UUID.class), any(InputStream.class), any(PluginCompatibility.class)
        )).thenReturn(new PluginCatalogService.UploadResult(validated, false));
        assertSchema(response(uploadRequest(), 200), "PluginVersionResponse");

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
    void servesRuntimeAssignmentsInventoryAndFullOrSingleRangeDownloads() throws Exception {
        assertSchema(response(get("/enterprise/api/v1/plugins/assignments"), 200),
            "RuntimePluginAssignmentsResponse");
        assertSchema(response(put("/enterprise/api/v1/plugins/inventory")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"items":[{"packageName":"@example/t13-tools","version":"1.0.0",
                "sha256":"%s","desiredRevision":9,"state":"ACTIVE","loaderPhase":"active",
                "lastErrorCode":null,"observedAt":"2026-08-19T03:00:00Z"}]}
                """.formatted(SHA256)), 200), "PluginInventoryResponse");

        var complete = download(null);
        assertThat(complete.getStatus()).isEqualTo(200);
        assertThat(complete.getContentAsByteArray()).containsExactly(DOWNLOAD_BYTES);
        assertThat(complete.getHeader(HttpHeaders.ACCEPT_RANGES)).isEqualTo("bytes");
        assertThat(complete.getHeader(HttpHeaders.ETAG)).isEqualTo("\"" + SHA256 + "\"");
        assertThat(complete.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");

        var partial = download("bytes=1-3");
        assertThat(partial.getStatus()).isEqualTo(206);
        assertThat(partial.getContentAsByteArray()).containsExactly('1', '2', '3');
        assertThat(partial.getHeader(HttpHeaders.CONTENT_RANGE)).isEqualTo("bytes 1-3/10");
    }

    @Test
    void mapsPluginValidationAuthorizationAndSizeFailuresToStableSchemas() throws Exception {
        doThrow(new PluginArtifactException(PluginArtifactException.Kind.INVALID, "invalid"))
            .when(catalog).upload(
                any(), any(UUID.class), any(InputStream.class), any(PluginCompatibility.class)
            );
        assertError(uploadRequest(), 400, "ENT_PLUGIN_ARTIFACT_INVALID");

        doThrow(new PluginArtifactException(PluginArtifactException.Kind.TOO_LARGE, "large"))
            .when(catalog).upload(
                any(), any(UUID.class), any(InputStream.class), any(PluginCompatibility.class)
            );
        assertError(uploadRequest(), 413, "ENT_PLUGIN_ARCHIVE_TOO_LARGE");

        doThrow(new PluginAccessException()).when(runtime).authorizeDownload(any(), anyLong());
        assertError(get("/enterprise/api/v1/plugins/versions/{id}/download", VERSION_ID),
            403, "ENT_PLUGIN_NOT_ASSIGNED");

        doReturn(new PluginRuntimeService.AuthorizedDownload(artifact, DOWNLOAD_BYTES.length, SHA256))
            .when(runtime).authorizeDownload(any(), anyLong());
        assertError(get("/enterprise/api/v1/plugins/versions/{id}/download", VERSION_ID)
            .header("Range", "bytes=9-3"), 400, "ENT_INVALID_REQUEST");
    }

    @Test
    void protectsEveryManagementOperationWithFrozenPermissionCodes() {
        assertPermissions(AdminPluginController.class, Map.of(
            "list", "ent:plugin:read",
            "upload", "ent:plugin:write",
            "publish", "ent:plugin:write",
            "retire", "ent:plugin:write",
            "replaceAssignments", "ent:plugin:write",
            "inventory", "ent:plugin:read"
        ));
    }

    private org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder uploadRequest() {
        MockMultipartFile artifactPart = new MockMultipartFile(
            "artifact", "plugin.tgz", "application/gzip", DOWNLOAD_BYTES
        );
        MockMultipartFile compatibilityPart = new MockMultipartFile(
            "compatibility", "", MediaType.APPLICATION_JSON_VALUE,
            compatibilityJson().getBytes(StandardCharsets.UTF_8)
        );
        return multipart("/enterprise/admin/v1/plugins/versions")
            .file(artifactPart)
            .file(compatibilityPart)
            .header("Idempotency-Key", IDEMPOTENCY_KEY);
    }

    private org.springframework.mock.web.MockHttpServletResponse download(String range) throws Exception {
        var request = get("/enterprise/api/v1/plugins/versions/{id}/download", VERSION_ID);
        if (range != null) request.header("Range", range);
        MvcResult pending = mvc.perform(request).andExpect(request().asyncStarted()).andReturn();
        return mvc.perform(asyncDispatch(pending)).andReturn().getResponse();
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
            "sha256/aa/" + SHA256 + ".tgz", DOWNLOAD_BYTES.length, SHA256, new byte[64], compatibility(),
            status, USER_ID, Instant.parse("2026-08-19T03:00:00Z"), revision
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
            "1.0.0", SHA256, 9, DevicePluginInventory.State.ACTIVE, "active", null,
            Instant.parse("2026-08-19T03:00:00Z")
        );
    }

    private static EffectivePluginResolver.ResolvedAssignments resolvedAssignments() {
        return new EffectivePluginResolver.ResolvedAssignments(9, List.of(new RuntimePluginAssignment(
            VERSION_ID, "@example/t13-tools", "1.0.0", DOWNLOAD_BYTES.length, SHA256,
            new byte[64], compatibility(), false, PluginAssignment.DesiredState.INSTALLED
        )));
    }

    private static PluginCompatibility compatibility() {
        return new PluginCompatibility(
            List.of(PluginCompatibility.LOCKED_HARNESS_COMMIT),
            ">=0.1.0 <0.2.0",
            List.of("darwin", "linux")
        );
    }

    private static String compatibilityJson() {
        return """
            {"harnessCommits":["%s"],"enterpriseBundleRange":">=0.1.0 <0.2.0",
            "operatingSystems":["darwin","linux"]}
            """.formatted(PluginCompatibility.LOCKED_HARNESS_COMMIT);
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
