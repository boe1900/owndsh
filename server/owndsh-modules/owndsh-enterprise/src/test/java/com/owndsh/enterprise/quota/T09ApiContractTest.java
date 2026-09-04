/**
 * [INPUT]: 依赖 T09 三个 Controller、统一异常边界、可信管理/设备上下文与派生 JSON Schemas。
 * [OUTPUT]: 验证十个 quota/usage operation、资源/主体失效、404/409/429 details 与 ledger 敏感字段隔离。
 * [POS]: T09 Server/OpenAPI 同步门禁，application services 使用 mock 隔离 HTTP 翻译与设备授权边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota;

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
import com.owndsh.enterprise.device.application.DeviceAccessException;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.application.DeviceService;
import com.owndsh.enterprise.device.domain.DeviceStatus;
import com.owndsh.enterprise.device.domain.EnterpriseDevice;
import com.owndsh.enterprise.device.web.DeviceRequestContextResolver;
import com.owndsh.enterprise.quota.application.QuotaExceededException;
import com.owndsh.enterprise.quota.application.QuotaPolicyService;
import com.owndsh.enterprise.quota.application.QuotaResourceNotFoundException;
import com.owndsh.enterprise.quota.application.QuotaUsageQueryService;
import com.owndsh.enterprise.quota.application.RequestAlreadyCompletedException;
import com.owndsh.enterprise.quota.application.RequestInProgressException;
import com.owndsh.enterprise.quota.domain.QuotaPolicy;
import com.owndsh.enterprise.quota.domain.QuotaPolicyType;
import com.owndsh.enterprise.quota.domain.QuotaResourceType;
import com.owndsh.enterprise.quota.domain.QuotaStatus;
import com.owndsh.enterprise.quota.domain.QuotaSubjectType;
import com.owndsh.enterprise.quota.domain.QuotaWindowType;
import com.owndsh.enterprise.quota.domain.UsageLedger;
import com.owndsh.enterprise.quota.domain.UsageLedgerMetadata;
import com.owndsh.enterprise.quota.domain.UsageResult;
import com.owndsh.enterprise.quota.persistence.QuotaSubjectStore;
import com.owndsh.enterprise.quota.persistence.UsageLedgerStore;
import com.owndsh.enterprise.quota.web.AdminQuotaController;
import com.owndsh.enterprise.quota.web.AdminUsageController;
import com.owndsh.enterprise.quota.web.RuntimeUsageController;
import com.owndsh.enterprise.revision.RevisionConflictException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
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
class T09ApiContractTest {
    private static final String TENANT = "000000";
    private static final long POLICY_ID = 1_900_900_000_000_000_001L;
    private static final long USER_ID = 1_761_100_000_000_000_003L;
    private static final long DEPARTMENT_ID = 1_761_000_000_000_000_103L;
    private static final long DEVICE_ID = 1_900_200_000_000_000_001L;
    private static final long MODEL_ID = 1_900_800_000_000_000_101L;
    private static final long LEDGER_ID = 1_900_900_000_000_000_201L;
    private static final String INSTALLATION = "123e4567-e89b-42d3-a456-426614174000";
    private static final String IDEMPOTENCY_KEY = "123e4567-e89b-42d3-a456-426614174000";
    private static final String ORIGINAL_REQUEST_ID = "req_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    private static final String SECRET = "must-never-appear";
    private static final Instant WINDOW_START = Instant.parse("2026-08-17T16:00:00Z");
    private static final Instant DAY_RESET = Instant.parse("2026-08-18T16:00:00Z");
    private static final Instant MONTH_RESET = Instant.parse("2026-08-31T16:00:00Z");
    private static final SchemaRegistry SCHEMAS =
        SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12);
    private static final Path CONTRACT_ROOT = findContractRoot();

    private QuotaPolicyService policies;
    private QuotaUsageQueryService usage;
    private DeviceService devices;
    private QuotaSubjectStore subjects;
    private MockMvc mvc;
    private QuotaPolicy policy;

    @BeforeEach
    void setUp() {
        policies = mock(QuotaPolicyService.class);
        usage = mock(QuotaUsageQueryService.class);
        devices = mock(DeviceService.class);
        subjects = mock(QuotaSubjectStore.class);
        policy = policy();

        IdentityAdminRequestContextResolver adminContexts = request -> new EnterpriseRequestContext(
            TENANT, USER_ID, EnterpriseRequestIds.current(request), "127.0.0.1", new byte[32]
        );
        DeviceRequestContextResolver deviceContexts = request -> new DeviceCallContext(
            TENANT,
            new PlatformSession(USER_ID, PlatformClient.DSH_DESKTOP, "harness", INSTALLATION),
            EnterpriseRequestIds.current(request), "127.0.0.1", new byte[32]
        );
        EnterpriseCursorCodec cursors = new EnterpriseCursorCodec(new SecretCipher(new byte[32]));
        mvc = standaloneSetup(
            new AdminQuotaController(policies, usage, adminContexts, cursors),
            new RuntimeUsageController(deviceContexts, devices, subjects, usage),
            new AdminUsageController(usage, adminContexts, cursors),
            new ErrorProbeController()
        ).setControllerAdvice(new EnterpriseExceptionHandler())
            .addFilters(new EnterpriseRequestIdFilter())
            .build();

        when(policies.list(TENANT, 0, 51)).thenReturn(List.of(policy));
        when(policies.get(TENANT, POLICY_ID)).thenReturn(policy);
        when(policies.create(any(), any())).thenReturn(policy);
        when(policies.update(any(), anyLong(), anyLong(), any())).thenReturn(policy);
        when(policies.setStatus(any(), anyLong(), anyLong(), any())).thenReturn(policy);
        doNothing().when(policies).delete(any(), anyLong(), anyLong());
        when(usage.currentWindows(TENANT, policy)).thenReturn(windows());
        when(devices.requireActive(any())).thenReturn(device());
        when(subjects.findActiveUser(USER_ID))
            .thenReturn(Optional.of(new QuotaSubjectStore.QuotaUser(USER_ID, DEPARTMENT_ID)));
        when(usage.myUsage(TENANT, USER_ID)).thenReturn(List.of(policyUsage()));
        when(usage.listUsage(anyString(), anyLong(), anyInt(), any())).thenReturn(usagePage());
    }

    @Test
    void servesAllTenQuotaAndUsageOperationsWithGeneratedSchemas() throws Exception {
        assertSchema(response(get("/enterprise/admin/v1/quotas"), 200), "QuotaPolicyListResponse");
        assertSchema(response(get("/enterprise/admin/v1/quotas/{id}", POLICY_ID), 200), "QuotaPolicyResponse");
        assertSchema(response(post("/enterprise/admin/v1/quotas")
            .header("Idempotency-Key", IDEMPOTENCY_KEY)
            .contentType(MediaType.APPLICATION_JSON)
            .content(policyRequest()), 201), "QuotaPolicyResponse");
        assertSchema(response(put("/enterprise/admin/v1/quotas/{id}", POLICY_ID)
            .header("If-Match", "0").contentType(MediaType.APPLICATION_JSON)
            .content(policyRequest()), 200), "QuotaPolicyResponse");
        assertSchema(response(delete("/enterprise/admin/v1/quotas/{id}", POLICY_ID)
            .header("If-Match", "0"), 200), "DeletedResourceResponse");
        for (String action : List.of("enable", "disable")) {
            assertSchema(response(post("/enterprise/admin/v1/quotas/{id}/actions/{action}", POLICY_ID, action)
                .header("If-Match", "0"), 200), "QuotaPolicyResponse");
        }
        assertSchema(response(get("/enterprise/admin/v1/quotas/{id}/windows", POLICY_ID), 200),
            "QuotaWindowListResponse");
        assertSchema(response(get("/enterprise/api/v1/usage/me"), 200), "MyQuotaUsageResponse");

        String ledger = response(get("/enterprise/admin/v1/usage")
            .param("userId", Long.toString(USER_ID))
            .param("departmentId", Long.toString(DEPARTMENT_ID))
            .param("modelId", Long.toString(MODEL_ID))
            .param("requestId", ORIGINAL_REQUEST_ID), 200);
        assertSchema(ledger, "UsageLedgerListResponse");
        assertThat(ledger)
            .doesNotContain("prompt")
            .doesNotContain("messages")
            .doesNotContain("provider")
            .doesNotContain("credential")
            .doesNotContain(SECRET);
    }

    @Test
    void servesSchemaValidFailureForEveryT09Operation() throws Exception {
        long unknownId = POLICY_ID + 99;
        when(policies.get(TENANT, unknownId)).thenThrow(new QuotaResourceNotFoundException());

        assertError(get("/enterprise/admin/v1/quotas").param("cursor", "invalid"), 400);
        assertError(post("/enterprise/admin/v1/quotas")
            .contentType(MediaType.APPLICATION_JSON).content(policyRequest()), 400);
        assertError(get("/enterprise/admin/v1/quotas/{id}", unknownId), 404);
        assertError(put("/enterprise/admin/v1/quotas/{id}", POLICY_ID)
            .contentType(MediaType.APPLICATION_JSON).content(policyRequest()), 400);
        assertError(delete("/enterprise/admin/v1/quotas/{id}", POLICY_ID), 400);
        doThrow(new QuotaResourceNotFoundException()).when(policies)
            .delete(any(), eq(unknownId), eq(0L));
        assertError(delete("/enterprise/admin/v1/quotas/{id}", unknownId)
            .header("If-Match", "0"), 404);
        assertError(post("/enterprise/admin/v1/quotas/{id}/actions/enable", POLICY_ID), 400);
        assertError(post("/enterprise/admin/v1/quotas/{id}/actions/disable", POLICY_ID), 400);
        assertError(get("/enterprise/admin/v1/quotas/{id}/windows", unknownId), 404);

        when(subjects.findActiveUser(USER_ID)).thenReturn(Optional.empty());
        String inactiveUser = mvc.perform(get("/enterprise/api/v1/usage/me"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("ENT_PERMISSION_DENIED"))
            .andReturn().getResponse().getContentAsString();
        assertSchema(inactiveUser, "EnterpriseErrorResponse");

        when(devices.requireActive(any())).thenThrow(new DeviceAccessException("ENT_DEVICE_REVOKED"));
        String revokedDevice = mvc.perform(get("/enterprise/api/v1/usage/me"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("ENT_DEVICE_REVOKED"))
            .andReturn().getResponse().getContentAsString();
        assertSchema(revokedDevice, "EnterpriseErrorResponse");
        assertError(get("/enterprise/admin/v1/usage").param("userId", "0"), 400);
        assertError(get("/enterprise/admin/v1/usage").param("requestId", "req_invalid"), 400);
    }

    @Test
    void mapsRevisionRequestAndQuotaConflictsToStableDetails() throws Exception {
        when(policies.update(any(), anyLong(), anyLong(), any()))
            .thenThrow(new RevisionConflictException(99, 4));
        String revision = mvc.perform(put("/enterprise/admin/v1/quotas/{id}", POLICY_ID)
                .header("If-Match", "99")
                .contentType(MediaType.APPLICATION_JSON)
                .content(policyRequest()))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error.code").value("ENT_REVISION_CONFLICT"))
            .andExpect(jsonPath("$.error.details.actualRevision").value(4))
            .andExpect(jsonPath("$.error.details.expectedRevision").value(99))
            .andReturn().getResponse().getContentAsString();
        assertSchema(revision, "EnterpriseErrorResponse");

        for (Map.Entry<String, String> entry : Map.of(
            "in-progress", "ENT_REQUEST_IN_PROGRESS",
            "completed", "ENT_REQUEST_ALREADY_COMPLETED"
        ).entrySet()) {
            String result = entry.getKey().equals("in-progress") ? "IN_PROGRESS" : "COMPLETED";
            String body = mvc.perform(get("/_t09/errors/request/{state}", entry.getKey()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value(entry.getValue()))
                .andExpect(jsonPath("$.error.details.originalRequestId").value(ORIGINAL_REQUEST_ID))
                .andExpect(jsonPath("$.error.details.result").value(result))
                .andReturn().getResponse().getContentAsString();
            assertSchema(body, "EnterpriseErrorResponse");
        }

        for (QuotaExceededException.Kind kind : QuotaExceededException.Kind.values()) {
            String body = mvc.perform(get("/_t09/errors/quota/{kind}", kind.name()))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error.code").value(kind.errorCode()))
                .andExpect(jsonPath("$.error.details.policyId").value(Long.toString(POLICY_ID)))
                .andExpect(jsonPath("$.error.details.resetsAt").value(DAY_RESET.toString()))
                .andReturn().getResponse().getContentAsString();
            assertSchema(body, "EnterpriseErrorResponse");
        }
    }

    @Test
    void protectsEveryManagementOperationWithFrozenPermissionCodes() {
        assertPermissions(AdminQuotaController.class, Map.of(
            "list", "ent:grant:read", "get", "ent:grant:read", "create", "ent:grant:write",
            "update", "ent:grant:write", "delete", "ent:grant:write", "enable", "ent:grant:write",
            "disable", "ent:grant:write", "windows", "ent:grant:read"
        ));
        assertPermissions(AdminUsageController.class, Map.of("list", "ent:usage:read"));
    }

    private String response(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request, int code)
        throws Exception {
        var response = mvc.perform(request).andReturn().getResponse();
        String body = response.getContentAsString();
        assertThat(response.getStatus()).as(body).isEqualTo(code);
        return body;
    }

    private void assertError(
        org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request,
        int code
    ) throws Exception {
        assertSchema(response(request, code), "EnterpriseErrorResponse");
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

    private static QuotaPolicy policy() {
        return new QuotaPolicy(
            POLICY_ID, TENANT, "Engineering", QuotaPolicyType.TOKEN, QuotaSubjectType.MEMBER, USER_ID, "Alice",
            QuotaResourceType.ALL_MODELS, null, "全部模型", null, 500_000L, null, 10_000_000L,
            null, null, QuotaStatus.ACTIVE, WINDOW_START, 0
        );
    }

    private static List<QuotaUsageQueryService.WindowUsage> windows() {
        return List.of(
            new QuotaUsageQueryService.WindowUsage(
                POLICY_ID, QuotaWindowType.DAY, WINDOW_START, DAY_RESET, 500_000, 12_000, 1_024
            ),
            new QuotaUsageQueryService.WindowUsage(
                POLICY_ID, QuotaWindowType.MONTH, WINDOW_START, MONTH_RESET, 10_000_000, 250_000, 1_024
            )
        );
    }

    private static QuotaUsageQueryService.PolicyUsage policyUsage() {
        List<QuotaUsageQueryService.WindowUsage> windows = windows();
        return new QuotaUsageQueryService.PolicyUsage(
            policy(), null, windows.get(0), null, windows.get(1),
            null, null
        );
    }

    private static QuotaUsageQueryService.UsagePage usagePage() {
        UsageLedger ledger = new UsageLedger(
            LEDGER_ID, TENANT, UUID.fromString("123e4567-e89b-42d3-a456-426614174001"),
            USER_ID, MODEL_ID, ORIGINAL_REQUEST_ID, 100, 50, 25, 175, UsageResult.SETTLED,
            null, Instant.parse("2026-08-18T10:59:00Z")
        );
        return new QuotaUsageQueryService.UsagePage(
            List.of(new UsageLedgerMetadata(
                ledger, "alice", "Alice", DEPARTMENT_ID, "Research", "deepseek-chat", "DeepSeek Chat"
            )),
            new UsageLedgerStore.UsageTotals(1, 100, 50, 25, 175)
        );
    }

    private static EnterpriseDevice device() {
        return new EnterpriseDevice(
            DEVICE_ID, TENANT, USER_ID, "alice", "Alice", UUID.fromString(INSTALLATION),
            "Alice MacBook", "darwin-arm64", "0.1.0-rc.5", "0.1.0", DeviceStatus.ACTIVE,
            Instant.parse("2026-08-18T08:00:00Z"), null, 0
        );
    }

    private static String policyRequest() {
        return """
            {"name":"Engineering","policyType":"TOKEN","subjectType":"MEMBER","subjectId":"%s",
             "resourceType":"ALL_MODELS","resourceId":null,
             "fiveHourTokenLimit":100000,"dailyTokenLimit":500000,
             "weeklyTokenLimit":2500000,"monthlyTokenLimit":10000000,"rpm":null,
             "concurrency":null,"status":"ACTIVE"}
            """.formatted(USER_ID);
    }

    private static Path findContractRoot() {
        String multiModuleRoot = System.getProperty("maven.multiModuleProjectDirectory");
        Path backendRoot = multiModuleRoot == null
            ? Path.of(System.getProperty("basedir")).resolve("../..").normalize()
            : Path.of(multiModuleRoot);
        return backendRoot.resolve("../contracts").normalize();
    }

    @RestController
    private static final class ErrorProbeController {
        @GetMapping("/_t09/errors/quota/{kind}")
        void quota(@PathVariable String kind) {
            throw new QuotaExceededException(QuotaExceededException.Kind.valueOf(kind), POLICY_ID, DAY_RESET);
        }

        @GetMapping("/_t09/errors/request/{state}")
        void request(@PathVariable String state) {
            if ("in-progress".equals(state)) throw new RequestInProgressException(ORIGINAL_REQUEST_ID);
            throw new RequestAlreadyCompletedException(ORIGINAL_REQUEST_ID);
        }
    }
}
