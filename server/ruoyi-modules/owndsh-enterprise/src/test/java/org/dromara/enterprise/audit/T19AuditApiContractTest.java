/**
 * [INPUT]: 依赖 AdminAuditController、MockMvc、权限注解、认证 cursor 与派生 JSON schema
 * [OUTPUT]: 验证 T19 管理查询、requestId 关联、筛选绑定 cursor、稳定 400 和敏感列隔离
 * [POS]: audit HTTP/OpenAPI 同步门禁；查询服务用 mock 隔离，真实 SQL 与 retention 由集成测试覆盖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.audit;

import cn.dev33.satoken.annotation.SaCheckPermission;
import org.dromara.enterprise.auth.web.EnterpriseRequestContext;
import org.dromara.enterprise.auth.web.IdentityAdminRequestContextResolver;
import org.dromara.enterprise.common.api.EnterpriseCursorCodec;
import org.dromara.enterprise.common.api.EnterpriseExceptionHandler;
import org.dromara.enterprise.common.api.EnterpriseRequestIdFilter;
import org.dromara.enterprise.common.api.EnterpriseRequestIds;
import org.dromara.enterprise.crypto.SecretCipher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import com.networknt.schema.InputFormat;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

@Tag("dev")
class T19AuditApiContractTest {
    private static final long USER_ID = 1_761_100_000_000_000_001L;
    private static final String REQUEST_ID = "req_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    private static final String OTHER_REQUEST_ID = "req_01ARZ3NDEKTSV4RRFFQ69G5FAW";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final SchemaRegistry SCHEMAS =
        SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12);
    private static final Path CONTRACT_ROOT = findContractRoot();

    private AuditQueryService audit;
    private MockMvc mvc;

    @BeforeEach
    void setUp() throws Exception {
        audit = mock(AuditQueryService.class);
        IdentityAdminRequestContextResolver contexts = request -> new EnterpriseRequestContext(
            "000000",USER_ID,EnterpriseRequestIds.current(request),"127.0.0.1",new byte[32]
        );
        EnterpriseCursorCodec cursors = new EnterpriseCursorCodec(new SecretCipher(new byte[32]));
        mvc = standaloneSetup(new AdminAuditController(audit,contexts,cursors))
            .setControllerAdvice(new EnterpriseExceptionHandler())
            .addFilters(new EnterpriseRequestIdFilter())
            .build();
        when(audit.list(anyString(),anyLong(),anyInt(),any())).thenReturn(List.of(
            record(101,AuditAction.MODEL_REQUEST_ACCEPTED,acceptedMetadata()),
            record(102,AuditAction.MODEL_REQUEST_FINISHED,finishedMetadata()),
            record(103,AuditAction.MODEL_REQUEST_FINISHED,finishedMetadata())
        ));
    }

    @Test
    void servesCorrelatedEventsWithSchemaValidCursorAndNoSensitiveColumns() throws Exception {
        String body = response(get("/enterprise/admin/v1/audit-events")
            .queryParam("requestId",REQUEST_ID)
            .queryParam("limit","2"),200);

        assertSchema(body,"AuditEventListResponse");
        assertThat(body)
            .contains("MODEL_REQUEST_ACCEPTED","MODEL_REQUEST_FINISHED",REQUEST_ID)
            .doesNotContain("sourceIp","userAgentHash","127.0.0.1");
        JsonNode document = JSON.readTree(body);
        assertThat(document.at("/data/items").size()).isEqualTo(2);
        assertThat(document.at("/data/page/hasMore").booleanValue()).isTrue();
        String nextCursor = document.at("/data/page/nextCursor").textValue();
        assertThat(nextCursor).isNotBlank();

        response(get("/enterprise/admin/v1/audit-events")
            .queryParam("requestId",REQUEST_ID)
            .queryParam("limit","2")
            .queryParam("cursor",nextCursor),200);
        String rebound = response(get("/enterprise/admin/v1/audit-events")
            .queryParam("requestId",OTHER_REQUEST_ID)
            .queryParam("limit","2")
            .queryParam("cursor",nextCursor),400);
        assertSchema(rebound,"EnterpriseErrorResponse");
        assertThat(rebound).contains("\"code\":\"ENT_INVALID_REQUEST\"");
    }

    @Test
    void rejectsMalformedRequestIdAndNonIncreasingTimeRange() throws Exception {
        String requestIdError = response(get("/enterprise/admin/v1/audit-events")
            .queryParam("requestId","req_not-ulid"),400);
        String rangeError = response(get("/enterprise/admin/v1/audit-events")
            .queryParam("from","2026-08-20T03:00:00Z")
            .queryParam("to","2026-08-20T03:00:00Z"),400);

        assertSchema(requestIdError,"EnterpriseErrorResponse");
        assertSchema(rangeError,"EnterpriseErrorResponse");
        assertThat(requestIdError).contains("\"code\":\"ENT_INVALID_REQUEST\"");
        assertThat(rangeError).contains("\"code\":\"ENT_INVALID_REQUEST\"");
    }

    @Test
    void protectsAuditQueryWithFrozenPermissionCode() throws Exception {
        SaCheckPermission permission = AdminAuditController.class.getMethod(
            "list",String.class,int.class,Long.class,AuditAction.class,String.class,String.class,
            AuditResult.class,String.class,String.class,Instant.class,Instant.class,
            jakarta.servlet.http.HttpServletRequest.class
        ).getAnnotation(SaCheckPermission.class);

        assertThat(permission).isNotNull();
        assertThat(permission.value()).containsExactly("ent:audit:read");
    }

    private String response(org.springframework.test.web.servlet.RequestBuilder request,int status) throws Exception {
        var response = mvc.perform(request).andReturn().getResponse();
        String body = response.getContentAsString();
        assertThat(response.getStatus()).as(body).isEqualTo(status);
        return body;
    }

    private static AuditEventRecord record(long id,AuditAction action,JsonNode metadata) {
        return new AuditEventRecord(
            id,Instant.parse("2026-08-20T03:00:00Z"),AuditActorType.USER,1001L,9001L,
            action,"MODEL_REQUEST","123e4567-e89b-42d3-a456-426614174000",AuditResult.SUCCESS,
            null,REQUEST_ID,metadata
        );
    }

    private static JsonNode acceptedMetadata() throws Exception {
        return JSON.readTree("""
            {"modelId":7001,"reservationId":"123e4567-e89b-42d3-a456-426614174000","estimatedTokens":512}
            """);
    }

    private static JsonNode finishedMetadata() throws Exception {
        return JSON.readTree("""
            {"modelId":7001,"reservationId":"123e4567-e89b-42d3-a456-426614174000",
             "outcome":"SETTLED","chargedTokens":321,"durationMs":800,"failure":"NONE"}
            """);
    }

    private static void assertSchema(String json,String schemaName) throws Exception {
        Path standalone = CONTRACT_ROOT.resolve("generated/schemas/" + schemaName + ".schema.json");
        String source;
        if (Files.isRegularFile(standalone)) {
            source = Files.readString(standalone);
        } else {
            JsonNode openApi = JSON.readTree(Files.readString(CONTRACT_ROOT.resolve(
                "generated/enterprise-openapi.json"
            )));
            source = openApi.get("components").get("schemas").get(schemaName).toString();
        }
        Schema schema = SCHEMAS.getSchema(source);
        assertThat(schema.validate(json,InputFormat.JSON)).as(json).isEmpty();
    }

    private static Path findContractRoot() {
        String multiModuleRoot = System.getProperty("maven.multiModuleProjectDirectory");
        Path backendRoot = multiModuleRoot == null
            ? Path.of(System.getProperty("basedir")).resolve("../..").normalize()
            : Path.of(multiModuleRoot);
        return backendRoot.resolve("../contracts").normalize();
    }
}
