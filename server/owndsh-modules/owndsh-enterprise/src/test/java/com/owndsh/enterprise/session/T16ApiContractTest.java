/**
 * [INPUT]: 依赖 runtime/admin Session Controller、MockMvc、权限注解、稳定异常映射与派生 JSON schemas。
 * [OUTPUT]: 验证八个 T16 operation、正文独立权限、严格响应和全部 Session 稳定错误状态。
 * [POS]: T16 Server/OpenAPI 同步门禁；application 用 mock 隔离 HTTP 翻译，真实事务由集成测试覆盖。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.session;

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
import com.owndsh.enterprise.crypto.EncryptedSecret;
import com.owndsh.enterprise.crypto.SecretCipher;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.web.DeviceRequestContextResolver;
import com.owndsh.enterprise.session.application.SessionException;
import com.owndsh.enterprise.session.application.SessionService;
import com.owndsh.enterprise.session.domain.SessionReplica;
import com.owndsh.enterprise.session.web.AdminSessionController;
import com.owndsh.enterprise.session.web.RuntimeSessionController;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

@Tag("dev")
class T16ApiContractTest {
    private static final long USER_ID = 1_761_100_000_000_000_001L;
    private static final long DEVICE_ID = 1_901_600_000_000_000_001L;
    private static final long REPLICA_ID = 1_901_600_000_000_000_101L;
    private static final String SESSION_ID = "session-api";
    private static final String REQUEST_ID = "req_01ARZ3NDEKTSV4RRFFQ69G5FAV";
    private static final String INSTALLATION = "123e4567-e89b-42d3-a456-426614174163";
    private static final String ZERO_HASH = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    private static final String ROLLING_HASH = "RBIRKkwhb8HIofWMvPq20HtIciKKnlI+c4DsI2dUWaQ=";
    private static final String PAYLOAD_HASH = "dThQQyfB0fyRNBMGkgmwgJ5kj4bHgMKYltmuhxgETxE=";
    private static final String PAYLOAD =
        "eyJ0eXBlIjoidHVybi9zdGFydCIsInNlcSI6MCwidGltZSI6MTc4NjkwMDAwMDAwMCwiZGF0YSI6eyJ0dXJuIjoxfX0K";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final SchemaRegistry SCHEMAS =
        SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12);
    private static final Path CONTRACT_ROOT = findContractRoot();

    private SessionService sessions;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        sessions = mock(SessionService.class);
        IdentityAdminRequestContextResolver adminContexts = request -> new EnterpriseRequestContext(
            "000000",USER_ID,EnterpriseRequestIds.current(request),"127.0.0.1",new byte[32]
        );
        DeviceRequestContextResolver deviceContexts = request -> runtimeContext();
        EnterpriseCursorCodec cursors = new EnterpriseCursorCodec(new SecretCipher(new byte[32]));
        mvc = standaloneSetup(
            new RuntimeSessionController(sessions,deviceContexts,cursors),
            new AdminSessionController(sessions,adminContexts,cursors)
        ).setControllerAdvice(new EnterpriseExceptionHandler())
            .addFilters(new EnterpriseRequestIdFilter())
            .build();

        SessionReplica replica = replica();
        when(sessions.append(any(),anyString(),any())).thenReturn(
            new SessionService.AppendResult(0,ROLLING_HASH,false)
        );
        when(sessions.listOwned(any(),anyLong(),anyInt())).thenReturn(List.of(
            new SessionService.OwnedSession(replica,"API title")
        ));
        when(sessions.listAdmin(any(),anyLong(),anyInt())).thenReturn(List.of(replica));
        when(sessions.exportOwned(any(),anyString(),anyLong(),anyInt())).thenReturn(export());
        when(sessions.readAdminContent(any(),anyLong(),anyLong(),anyInt())).thenReturn(export());
        when(sessions.deleteOwned(any(),anyString())).thenReturn(deleted());
        when(sessions.deleteAdmin(any(),anyLong())).thenReturn(deleted());
        when(sessions.recordRestore(any(),anyString(),anyString())).thenReturn(
            new SessionService.RestoreRecord(SESSION_ID,"restored-session-api",Instant.parse("2026-08-19T08:10:00Z"))
        );
    }

    @Test
    void servesAllRuntimeAndAdminOperationsWithSchemaValidResponses() throws Exception {
        assertSchema(response(post("/enterprise/api/v1/sessions/{id}/batches",SESSION_ID)
            .contentType(MediaType.APPLICATION_JSON).content(batchRequest()),200),"SessionBatchAcceptedResponse");
        assertSchema(response(get("/enterprise/api/v1/sessions"),200),"OwnedSessionListResponse");
        assertSchema(response(get("/enterprise/api/v1/sessions/{id}/export",SESSION_ID),200),
            "SessionExportResponse");
        assertSchema(response(delete("/enterprise/api/v1/sessions/{id}",SESSION_ID),200),
            "DeletedSessionResponse");
        assertSchema(response(post("/enterprise/api/v1/sessions/{id}/restore-record",SESSION_ID)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"restoredSessionId\":\"restored-session-api\"}"),200),
            "SessionRestoreRecordResponse");

        String metadata = response(get("/enterprise/admin/v1/sessions"),200);
        assertSchema(metadata,"AdminSessionListResponse");
        assertThat(metadata).doesNotContain("API title","payloadBase64","header");
        assertSchema(response(get("/enterprise/admin/v1/sessions/{id}/content",REPLICA_ID),200),
            "SessionExportResponse");
        assertSchema(response(delete("/enterprise/admin/v1/sessions/{id}",REPLICA_ID),200),
            "DeletedSessionResponse");
    }

    @Test
    void mapsEverySessionFailureToItsFrozenStatusAndCode() throws Exception {
        Map<SessionException.Kind,Integer> statuses = Map.of(
            SessionException.Kind.FORMAT_UNSUPPORTED,400,
            SessionException.Kind.BATCH_TOO_LARGE,413,
            SessionException.Kind.SEQ_GAP,409,
            SessionException.Kind.DIVERGED,409,
            SessionException.Kind.SOURCE_DEVICE_CONFLICT,409,
            SessionException.Kind.CONTENT_EXPIRED,404,
            SessionException.Kind.NOT_FOUND,404
        );
        for (Map.Entry<SessionException.Kind,Integer> entry : statuses.entrySet()) {
            doThrow(new SessionException(entry.getKey())).when(sessions).append(any(),anyString(),any());
            String body = response(post("/enterprise/api/v1/sessions/{id}/batches",SESSION_ID)
                .contentType(MediaType.APPLICATION_JSON).content(batchRequest()),entry.getValue());
            assertThat(body).contains("\"code\":\"" + entry.getKey().errorCode() + "\"");
            assertSchema(body,"EnterpriseErrorResponse");
        }
    }

    @Test
    void protectsAdminMetadataContentAndDeleteWithSeparatePermissionCodes() {
        assertPermissions(AdminSessionController.class,Map.of(
            "list","ent:session:read",
            "content","ent:session:content:read",
            "delete","ent:session:delete"
        ));
    }

    private String response(org.springframework.test.web.servlet.RequestBuilder request,int status) throws Exception {
        var response = mvc.perform(request).andReturn().getResponse();
        String body = response.getContentAsString();
        assertThat(response.getStatus()).as(body).isEqualTo(status);
        return body;
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

    private static void assertPermissions(Class<?> controller,Map<String,String> expected) {
        Map<String,String> actual = new HashMap<>();
        for (Method method : controller.getDeclaredMethods()) {
            SaCheckPermission permission = method.getAnnotation(SaCheckPermission.class);
            if (permission != null) actual.put(method.getName(),permission.value()[0]);
        }
        assertThat(actual).containsExactlyInAnyOrderEntriesOf(expected);
    }

    private static SessionReplica replica() {
        EncryptedSecret encrypted = new EncryptedSecret(new byte[16],new byte[12],1);
        return new SessionReplica(
            REPLICA_ID,"000000",SESSION_ID,USER_ID,"admin",DEVICE_ID,"API Desktop",0,1,
            encrypted,encrypted,0,1,new byte[32],SessionReplica.Status.ACTIVE,
            Instant.parse("2026-08-19T08:00:00Z"),Instant.parse("2026-08-19T08:01:00Z"),null
        );
    }

    private static SessionService.ExportPage export() {
        return new SessionService.ExportPage(
            SESSION_ID,JSON.readTree("""
                {"version":0,"id":"session-api","createdAt":1786900000000,"cwd":"/work","delegationDepth":0}
                """),"API title",0,0,1,ZERO_HASH,ROLLING_HASH,PAYLOAD_HASH,PAYLOAD,false
        );
    }

    private static SessionService.DeletedSession deleted() {
        return new SessionService.DeletedSession(
            REPLICA_ID,SESSION_ID,SessionReplica.Status.DELETED,Instant.parse("2026-08-19T08:10:00Z")
        );
    }

    private static DeviceCallContext runtimeContext() {
        return new DeviceCallContext(
            "000000",new PlatformSession(USER_ID,PlatformClient.DSH_DESKTOP,"harness",INSTALLATION),
            REQUEST_ID,"127.0.0.1",new byte[32]
        );
    }

    private static String batchRequest() {
        return """
            {"idempotencyKey":"device:session-api:0:0","fromSeq":0,"toSeq":0,
             "previousRollingHash":"%s","payloadSha256":"%s","payloadBase64":"%s",
             "header":{"version":0,"id":"session-api","createdAt":1786900000000,
                       "cwd":"/work","delegationDepth":0},"title":"API title"}
            """.formatted(ZERO_HASH,PAYLOAD_HASH,PAYLOAD);
    }

    private static Path findContractRoot() {
        String multiModuleRoot = System.getProperty("maven.multiModuleProjectDirectory");
        Path backendRoot = multiModuleRoot == null
            ? Path.of(System.getProperty("basedir")).resolve("../..").normalize()
            : Path.of(multiModuleRoot);
        return backendRoot.resolve("../contracts").normalize();
    }
}
