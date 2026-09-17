/**
 * [INPUT]: 依赖真实 PostgreSQL/Flyway、MCP 与既有用户组服务、MockMvc 和认证 cursor。
 * [OUTPUT]: 验证授权并集/回收、CAS 并发、事务回滚、tenant 边界、HTTP(S) OAuth 与固定请求头/单认证头配置分发、分页/字符串 ID 协议。
 * [POS]: MCP 授权纵向门禁，覆盖配置分发事实；不把端侧连接撤销冒充为已验证。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp;

import com.owndsh.enterprise.audit.JdbcAuditSink;
import com.owndsh.enterprise.auth.application.AccessGroupService;
import com.owndsh.enterprise.auth.application.IdentityMutationContext;
import com.owndsh.enterprise.auth.web.EnterpriseRequestContext;
import com.owndsh.enterprise.auth.web.IdentityAdminRequestContextResolver;
import com.owndsh.enterprise.common.api.EnterpriseCursorCodec;
import com.owndsh.enterprise.common.api.EnterpriseExceptionHandler;
import com.owndsh.enterprise.common.api.EnterpriseRequestIdFilter;
import com.owndsh.enterprise.common.api.EnterpriseRequestIds;
import com.owndsh.enterprise.crypto.SecretCipher;
import com.owndsh.enterprise.mcp.application.McpService;
import com.owndsh.enterprise.mcp.domain.McpGrant;
import com.owndsh.enterprise.mcp.domain.McpServer;
import com.owndsh.enterprise.mcp.persistence.JdbcMcpStore;
import com.owndsh.enterprise.mcp.web.AdminMcpController;
import com.owndsh.enterprise.mcp.web.AdminMcpGrantController;
import com.owndsh.enterprise.revision.JdbcBootstrapRevisionStore;
import com.owndsh.enterprise.revision.BootstrapRevisionStore;
import com.owndsh.enterprise.revision.RevisionConflictException;
import com.owndsh.enterprise.test.PostgresTestDatabase;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

@Tag("dev")
class McpGrantIntegrationTest {
    private static final String TENANT = "000000";
    private static final long USER = 1_900_800_000_000_900_001L;
    private static final long OTHER_USER = USER + 1;
    private static final AtomicLong IDS = new AtomicLong(1_903_000_000_000_000_000L);
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static PostgresTestDatabase.Database database;
    private JdbcMcpStore store;
    private JdbcBootstrapRevisionStore revisions;
    private McpService service;
    private AccessGroupService groups;
    private MockMvc mvc;
    private final IdentityMutationContext context = new IdentityMutationContext(
        TENANT, USER, "req_01ARZ3NDEKTSV4RRFFQ69G5FAV", "127.0.0.1", new byte[32]
    );

    @BeforeAll
    static void database() {
        database = PostgresTestDatabase.create("mcp_grants");
        PostgresTestDatabase.migrate(database, null);
        PostgresTestDatabase.insertActiveUser(database, USER, 1_761_000_000_000_000_103L, "mcp-owner", "MCP Owner");
        PostgresTestDatabase.insertActiveUser(database, OTHER_USER, 1_761_000_000_000_000_103L, "mcp-other", "MCP Other");
    }

    @BeforeEach
    void services() {
        var tx = new TransactionTemplate(new DataSourceTransactionManager(database.dataSource()));
        store = new JdbcMcpStore(database.jdbc(), JSON);
        revisions = new JdbcBootstrapRevisionStore(database.jdbc());
        service = new McpService(tx, store, revisions, IDS::incrementAndGet, new JdbcAuditSink(database.jdbc(), JSON));
        groups = new AccessGroupService(tx, database.jdbc(), revisions, new JdbcAuditSink(database.jdbc(), JSON), IDS::incrementAndGet);
        IdentityAdminRequestContextResolver contexts = request -> new EnterpriseRequestContext(
            TENANT, USER, EnterpriseRequestIds.current(request), "127.0.0.1", new byte[32]
        );
        var cursors = new EnterpriseCursorCodec(new SecretCipher(new byte[32]));
        mvc = standaloneSetup(new AdminMcpController(service, contexts, cursors), new AdminMcpGrantController(service, contexts, cursors))
            .setControllerAdvice(new EnterpriseExceptionHandler()).addFilters(new EnterpriseRequestIdFilter()).build();
    }

    @Test
    void resolvesGroupsAndRevokesAssignmentsWhenTheLastMembershipIsRemoved() {
        var server = service.create(server(TENANT));
        var group = groups.create(context, "Engineering", List.of(USER));
        service.createGrants(TENANT, List.of(grant(server.id(), McpGrant.SubjectType.GROUP, group.id())));
        assertThat(service.assignments(TENANT, USER)).extracting(McpServer::id).contains(server.id());
        assertThat(service.assignments(TENANT, OTHER_USER)).extracting(McpServer::id).doesNotContain(server.id());

        long source = IDS.incrementAndGet();
        database.jdbc().update("""
            insert into ent_identity_source(id,tenant_id,type,name,status,issuer,client_id)
            values (?,?,'OIDC','MCP fixture','ACTIVE','https://id.example.test','mcp-test')
            """, source, TENANT);
        database.jdbc().update("insert into ent_access_group_member(group_id,user_id,source_type,source_id) values (?,?,'IDENTITY_SOURCE',?)", group.id(), USER, source);
        assertThat(service.assignments(TENANT, USER).stream().filter(s -> s.id() == server.id())).hasSize(1);
        long revision = revisions.current(TENANT);
        var emptyManual = groups.update(context, group.id(), group.revision(), group.name(), List.of());
        assertThat(revisions.current(TENANT)).isEqualTo(revision + 1);
        assertThat(service.assignments(TENANT, USER)).extracting(McpServer::id).contains(server.id());
        database.jdbc().update("delete from ent_access_group_member where group_id=? and source_type='IDENTITY_SOURCE'", group.id());
        assertThat(service.assignments(TENANT, USER)).extracting(McpServer::id).doesNotContain(server.id());
        assertThatThrownBy(() -> groups.delete(context, group.id(), emptyManual.revision())).hasMessageContaining("授权引用");

        var restored = groups.update(context, group.id(), emptyManual.revision(), group.name(), List.of(USER));
        service.createGrants(TENANT, List.of(grant(server.id(), McpGrant.SubjectType.USER, USER), grant(server.id(), McpGrant.SubjectType.ALL, null)));
        assertThat(service.assignments(TENANT, USER).stream().filter(s -> s.id() == server.id())).hasSize(1);
        groups.update(context, group.id(), restored.revision(), group.name(), List.of());
        assertThat(service.assignments(TENANT, USER)).extracting(McpServer::id).contains(server.id());
        service.changeStatus(TENANT, server.id(), McpServer.Status.DISABLED, server.revision());
        assertThat(service.assignments(TENANT, USER)).extracting(McpServer::id).doesNotContain(server.id());
    }

    @Test
    void rejectsForeignSubjectsAndRollsBackTheWholeBatchAndRevision() {
        var server = service.create(server(TENANT));
        var foreignServer = server("other");
        store.insert(foreignServer);
        long foreignGroup = IDS.incrementAndGet();
        database.jdbc().update("insert into ent_access_group(id,tenant_id,name) values (?,'other','Foreign group')", foreignGroup);
        long revision = revisions.current(TENANT);
        for (var invalid : List.of(
            grant(server.id(), McpGrant.SubjectType.GROUP, foreignGroup),
            grant(foreignServer.id(), McpGrant.SubjectType.ALL, null),
            grant(server.id(), McpGrant.SubjectType.USER, 999L)
        )) {
            assertThatThrownBy(() -> service.createGrants(TENANT, List.of(grant(server.id(), McpGrant.SubjectType.ALL, null), invalid)))
                .isInstanceOf(IllegalArgumentException.class);
            assertThat(revisions.current(TENANT)).isEqualTo(revision);
            assertThat(store.listGrants(TENANT, 0, 200)).noneMatch(g -> g.serverId() == server.id());
        }
        assertThatThrownBy(() -> store.insertGrant(grant(foreignServer.id(), McpGrant.SubjectType.ALL, null)))
            .isInstanceOf(DataIntegrityViolationException.class);
        service.createGrants(TENANT, List.of(grant(server.id(), McpGrant.SubjectType.ALL, null)));
        long createdRevision = revisions.current(TENANT);
        assertThatThrownBy(() -> service.createGrants(TENANT, List.of(
            grant(server.id(), McpGrant.SubjectType.USER, USER), grant(server.id(), McpGrant.SubjectType.ALL, null)
        ))).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("重复");
        assertThat(revisions.current(TENANT)).isEqualTo(createdRevision);
        assertThat(store.listGrants(TENANT, 0, 200).stream().filter(g -> g.serverId() == server.id())).hasSize(1);

        // ---- 即使遗留数据绕过入口写入，也不能通过外租户组获得配置 ----
        var groupOnly = service.create(server(TENANT));
        store.insertGrant(grant(groupOnly.id(), McpGrant.SubjectType.GROUP, foreignGroup));
        database.jdbc().update("insert into ent_access_group_member(group_id,user_id,source_type) values (?,?,'MANUAL')", foreignGroup, USER);
        assertThat(service.assignments(TENANT, USER)).extracting(McpServer::id).doesNotContain(groupOnly.id());
    }

    @Test
    void keepsHttpPaginationStringIdsAndAllSubjectNullAligned() throws Exception {
        service.create(server(TENANT));
        var group = groups.create(context, "HTTP group", List.of(USER));
        String response = mvc.perform(post("/enterprise/admin/v1/mcp-servers")
            .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"serverName":"http-fixture","displayName":"HTTP fixture","description":"",
                 "transport":"streamable-http","url":"https://mcp.example.test","allowInsecureTransport":false,
                 "headers":{"X-Apifox-Api-Version":"2025-09-01"},"auth":{"type":"api-key","headerName":"Authorization"},"toolCallTimeoutMs":60000,
                 "reconnect":{"enabled":true,"initialDelayMs":1000,"maxDelayMs":30000,"maxAttempts":5},"presentation":"search"}
                """))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.data.id").isString())
            .andExpect(jsonPath("$.data.headers['X-Apifox-Api-Version']").value("2025-09-01"))
            .andExpect(jsonPath("$.data.auth.headerName").value("Authorization"))
            .andExpect(jsonPath("$.data.auth.valuePrefix").doesNotExist())
            .andReturn().getResponse().getContentAsString();
        String serverId = JSON.readTree(response).path("data").path("id").asString();
        String body = """
            {"items":[{"serverId":"%s","subjectType":"GROUP","subjectId":"%s","status":"ACTIVE"},
                      {"serverId":"%s","subjectType":"ALL","subjectId":null,"status":"ACTIVE"}]}
            """.formatted(serverId, group.id(), serverId);
        mvc.perform(post("/enterprise/admin/v1/mcp-grants").header("Idempotency-Key", UUID.randomUUID())
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].id").isString())
            .andExpect(jsonPath("$.data[0].subjectId").value(Long.toString(group.id())))
            .andExpect(jsonPath("$.data[0].tenantId").doesNotExist())
            .andExpect(jsonPath("$.data[1].subjectId").value(org.hamcrest.Matchers.nullValue()));
        service.changeStatus(TENANT, Long.parseLong(serverId), McpServer.Status.ACTIVE, 0);
        var assignment = service.assignments(TENANT, USER).stream().filter(item -> item.id() == Long.parseLong(serverId)).findFirst().orElseThrow();
        assertThat(assignment.headers()).isEqualTo(Map.of("X-Apifox-Api-Version", "2025-09-01"));
        assertThat(assignment.auth()).isEqualTo(Map.of("type", "api-key", "headerName", "Authorization"));
        for (String path : List.of("mcp-grants", "mcp-servers")) {
            String first = mvc.perform(get("/enterprise/admin/v1/" + path).param("limit", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].id").isString())
                .andExpect(jsonPath("$.data.page.hasMore").value(true)).andReturn().getResponse().getContentAsString();
            String cursor = JSON.readTree(first).path("data").path("page").path("nextCursor").asString();
            String second = mvc.perform(get("/enterprise/admin/v1/" + path).param("limit", "1").param("cursor", cursor))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            assertThat(JSON.readTree(second).path("data").path("items").get(0).path("id").asString())
                .isNotEqualTo(JSON.readTree(first).path("data").path("items").get(0).path("id").asString());
            mvc.perform(get("/enterprise/admin/v1/" + path).param("limit", "0")).andExpect(status().isBadRequest());
            mvc.perform(get("/enterprise/admin/v1/" + path).param("cursor", "tampered")).andExpect(status().isBadRequest());
        }
        for (String invalid : List.of(body.replace("\"subjectId\":null", "\"subjectId\":\"0\""), "{\"items\":[]}")) {
            mvc.perform(post("/enterprise/admin/v1/mcp-grants").header("Idempotency-Key", UUID.randomUUID())
                .contentType(MediaType.APPLICATION_JSON).content(invalid)).andExpect(status().isBadRequest());
        }
    }

    @Test
    void acceptsHttpOAuthMetadataAndRejectsInvalidEndpointShapes() throws Exception {
        String body = """
            {"serverName":"intranet-oauth","displayName":"Intranet OAuth","description":"",
             "transport":"streamable-http","url":"http://localhost:8090/mcp","allowInsecureTransport":true,
             "headers":{},"auth":{"type":"oauth","issuer":"http://auth.internal/auth","resource":"http://localhost:8090/mcp",
             "clientId":"public-client","scopes":["server"],"authorizationEndpoint":"http://auth.internal/auth/authorize","tokenEndpoint":"http://auth.internal/auth/token"},
             "toolCallTimeoutMs":60000,"reconnect":{"enabled":true,"initialDelayMs":1000,"maxDelayMs":30000,"maxAttempts":5},"presentation":"search"}
            """;
        String response = mvc.perform(post("/enterprise/admin/v1/mcp-servers").header("Idempotency-Key", UUID.randomUUID())
            .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.data.auth.issuer").value("http://auth.internal/auth"))
            .andExpect(jsonPath("$.data.auth.resource").value("http://localhost:8090/mcp"))
            .andReturn().getResponse().getContentAsString();
        long id = Long.parseLong(JSON.readTree(response).path("data").path("id").asString());
        mvc.perform(put("/enterprise/admin/v1/mcp-servers/" + id).header("If-Match", 0)
            .contentType(MediaType.APPLICATION_JSON).content(body.replace("/auth/token", "/auth/token-v2")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.auth.tokenEndpoint").value("http://auth.internal/auth/token-v2"));
        service.changeStatus(TENANT, id, McpServer.Status.ACTIVE, 1);
        service.createGrants(TENANT, List.of(grant(id, McpGrant.SubjectType.ALL, null)));
        var assignment = service.assignments(TENANT, USER).stream().filter(item -> item.id() == id).findFirst().orElseThrow();
        assertThat(assignment.auth()).containsEntry("tokenEndpoint", "http://auth.internal/auth/token-v2");
        for (String invalid : List.of("ftp://auth.internal/auth", "http://user:password@auth.internal/auth", "http://auth.internal/auth#fragment", "http:/missing-host")) {
            mvc.perform(put("/enterprise/admin/v1/mcp-servers/" + id).header("If-Match", 2)
                .contentType(MediaType.APPLICATION_JSON).content(body.replace("http://auth.internal/auth", invalid)))
                .andExpect(status().isBadRequest());
        }
    }

    @Test
    void rejectsCredentialHeadersAndPrefixConfiguration() throws Exception {
        String template = """
            {"serverName":"headers-fixture","displayName":"Headers fixture","description":"",
             "transport":"streamable-http","url":"https://mcp.example.test","allowInsecureTransport":false,
             "headers":%s,"auth":%s,"toolCallTimeoutMs":60000,
             "reconnect":{"enabled":true,"initialDelayMs":1000,"maxDelayMs":30000,"maxAttempts":5},"presentation":"search"}
            """;
        String auth = "{\"type\":\"api-key\",\"headerName\":\"X-Api-Key\"}";
        for (String headers : List.of("{\"Authorization\":\"test\"}", "{\"X-API-KEY\":\"test\"}", "{\"X-Version\":\"1\",\"x-version\":\"2\"}", "{\"Bad Header\":\"test\"}", "{\"X-Version\":\"bad\\r\\nvalue\"}")) {
            mvc.perform(post("/enterprise/admin/v1/mcp-servers").header("Idempotency-Key", UUID.randomUUID())
                .contentType(MediaType.APPLICATION_JSON).content(template.formatted(headers, auth)))
                .andExpect(status().isBadRequest());
        }
        mvc.perform(post("/enterprise/admin/v1/mcp-servers").header("Idempotency-Key", UUID.randomUUID())
            .contentType(MediaType.APPLICATION_JSON).content(template.formatted("{}", "{\"type\":\"api-key\",\"headerName\":\"Authorization\",\"valuePrefix\":\"Bearer \"}")))
            .andExpect(status().isBadRequest());
    }

    @Test
    void changesAndDeletesGrantsThroughHttpWithRevisionAndTenantGuards() throws Exception {
        var server = service.create(server(TENANT));
        var group = groups.create(context, "Lifecycle group", List.of(USER));
        var groupGrant = grant(server.id(), McpGrant.SubjectType.GROUP, group.id());
        var userGrant = grant(server.id(), McpGrant.SubjectType.USER, USER);
        service.createGrants(TENANT, List.of(groupGrant, userGrant));
        String path = "/enterprise/admin/v1/mcp-grants/" + groupGrant.id();
        long revision = revisions.current(TENANT);
        mvc.perform(put(path).header("If-Match", 0).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"ACTIVE\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.revision").value(0));
        assertThat(revisions.current(TENANT)).isEqualTo(revision);
        mvc.perform(put(path).header("If-Match", 0).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"DISABLED\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(Long.toString(groupGrant.id())))
            .andExpect(jsonPath("$.data.status").value("DISABLED")).andExpect(jsonPath("$.data.revision").value(1));
        assertThat(revisions.current(TENANT)).isEqualTo(revision + 1);
        // ---- 删除一条重叠授权不影响另一条；删除最后一条才失去配置 ----
        assertThat(service.assignments(TENANT, USER)).extracting(McpServer::id).contains(server.id());
        service.deleteGrant(TENANT, userGrant.id(), 0);
        assertThat(service.assignments(TENANT, USER)).extracting(McpServer::id).doesNotContain(server.id());
        mvc.perform(delete(path).header("If-Match", 0)).andExpect(status().isConflict())
            .andExpect(jsonPath("$.error.code").value("ENT_REVISION_CONFLICT"))
            .andExpect(jsonPath("$.error.details.actualRevision").value(1));
        mvc.perform(put(path).header("If-Match", 0).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"ACTIVE\"}"))
            .andExpect(status().isConflict());
        assertThat(revisions.current(TENANT)).isEqualTo(revision + 2);
        mvc.perform(put(path).header("If-Match", 1).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"ACTIVE\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.revision").value(2));
        assertThat(service.assignments(TENANT, USER)).extracting(McpServer::id).contains(server.id());
        for (String body : List.of("{}", "{\"status\":null}", "{\"status\":\"UNKNOWN\"}")) {
            mvc.perform(put(path).header("If-Match", 2).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest());
        }
        mvc.perform(delete(path)).andExpect(status().isBadRequest());
        mvc.perform(delete(path).header("If-Match", -1)).andExpect(status().isBadRequest());
        mvc.perform(delete(path).header("If-Match", 2)).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.id").value(Long.toString(groupGrant.id())))
            .andExpect(jsonPath("$.data.deleted").value(true));
        assertThat(service.assignments(TENANT, USER)).extracting(McpServer::id).doesNotContain(server.id());
        assertThat(revisions.current(TENANT)).isEqualTo(revision + 4);
        mvc.perform(delete(path).header("If-Match", 2)).andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error.code").value("ENT_RESOURCE_NOT_FOUND"));
        groups.delete(context, group.id(), group.revision());
        assertThat(groups.list(TENANT, 0, 200)).noneMatch(value -> value.id() == group.id());

        var foreignServer = server("foreign");
        store.insert(foreignServer);
        var foreignGrant = new McpGrant(IDS.incrementAndGet(), "foreign", foreignServer.id(), McpGrant.SubjectType.ALL,
            null, McpGrant.Status.ACTIVE, 0, USER, Instant.now(), Instant.now());
        store.insertGrant(foreignGrant);
        String foreignPath = "/enterprise/admin/v1/mcp-grants/" + foreignGrant.id();
        long beforeForeign = revisions.current(TENANT);
        mvc.perform(put(foreignPath).header("If-Match", 0).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"DISABLED\"}"))
            .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("ENT_RESOURCE_NOT_FOUND"));
        mvc.perform(delete(foreignPath).header("If-Match", 0)).andExpect(status().isNotFound());
        assertThat(store.listGrants("foreign", 0, 200)).singleElement().satisfies(value -> {
            assertThat(value.id()).isEqualTo(foreignGrant.id());
            assertThat(value.status()).isEqualTo(McpGrant.Status.ACTIVE);
            assertThat(value.revision()).isZero();
        });
        assertThat(revisions.current(TENANT)).isEqualTo(beforeForeign);
    }

    @Test
    void permitsOnlyOneConcurrentStatusChangeForTheSameRevision() throws Exception {
        var server = service.create(server(TENANT));
        var grant = grant(server.id(), McpGrant.SubjectType.ALL, null);
        service.createGrants(TENANT, List.of(grant));
        long revision = revisions.current(TENANT);
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<String> change = () -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("concurrent start timed out");
                try {
                    service.changeGrantStatus(TENANT, grant.id(), McpGrant.Status.DISABLED, 0);
                    return "changed";
                } catch (RevisionConflictException conflict) {
                    return "conflict";
                }
            };
            var first = executor.submit(change);
            var second = executor.submit(change);
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder("changed", "conflict");
        }
        assertThat(revisions.current(TENANT)).isEqualTo(revision + 1);
        assertThat(service.assignments(TENANT, USER)).extracting(McpServer::id).doesNotContain(server.id());
    }

    @Test
    void rollsBackStatusAndDeletionWhenBootstrapRevisionCannotBeWritten() {
        var server = service.create(server(TENANT));
        var grant = grant(server.id(), McpGrant.SubjectType.ALL, null);
        service.createGrants(TENANT, List.of(grant));
        var failedRevisions = mock(BootstrapRevisionStore.class);
        when(failedRevisions.increment(TENANT)).thenThrow(new IllegalStateException("revision write failed"));
        var failing = new McpService(new TransactionTemplate(new DataSourceTransactionManager(database.dataSource())),
            store, failedRevisions, IDS::incrementAndGet);
        assertThatThrownBy(() -> failing.changeGrantStatus(TENANT, grant.id(), McpGrant.Status.DISABLED, 0))
            .hasMessage("revision write failed");
        assertThatThrownBy(() -> failing.deleteGrant(TENANT, grant.id(), 0)).hasMessage("revision write failed");
        assertThat(store.listGrants(TENANT, 0, 200)).filteredOn(value -> value.id() == grant.id()).singleElement().satisfies(value -> {
            assertThat(value.status()).isEqualTo(McpGrant.Status.ACTIVE);
            assertThat(value.revision()).isZero();
        });
        assertThat(service.assignments(TENANT, USER)).extracting(McpServer::id).contains(server.id());
    }

    @Test
    void replaysMcpCreatesAndRejectsTheSameKeyWithAnotherBody() throws Exception {
        UUID serverKey = UUID.randomUUID();
        String body = """
            {"serverName":"idempotent-mcp","displayName":"Idempotent MCP","description":"",
             "transport":"streamable-http","url":"https://mcp.idempotent.test","allowInsecureTransport":false,
             "headers":{},"auth":{"type":"none"},"toolCallTimeoutMs":60000,
             "reconnect":{"enabled":true,"initialDelayMs":1000,"maxDelayMs":30000,"maxAttempts":5},"presentation":"search"}
            """;
        String first = mvc.perform(post("/enterprise/admin/v1/mcp-servers").header("Idempotency-Key", serverKey)
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated()).andReturn()
            .getResponse().getContentAsString();
        String replay = mvc.perform(post("/enterprise/admin/v1/mcp-servers").header("Idempotency-Key", serverKey)
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated()).andReturn()
            .getResponse().getContentAsString();
        assertThat(JSON.readTree(replay).path("data").path("id").asString())
            .isEqualTo(JSON.readTree(first).path("data").path("id").asString());
        mvc.perform(post("/enterprise/admin/v1/mcp-servers").header("Idempotency-Key", serverKey)
                .contentType(MediaType.APPLICATION_JSON).content(body.replace("Idempotent MCP", "Changed")))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("ENT_IDEMPOTENCY_CONFLICT"));

        long serverId = Long.parseLong(JSON.readTree(first).path("data").path("id").asString());
        UUID grantKey = UUID.randomUUID();
        String grantBody = "{\"items\":[{\"serverId\":\"" + serverId + "\",\"subjectType\":\"ALL\",\"subjectId\":null,\"status\":\"ACTIVE\"}]}";
        mvc.perform(post("/enterprise/admin/v1/mcp-grants").header("Idempotency-Key", grantKey)
                .contentType(MediaType.APPLICATION_JSON).content(grantBody)).andExpect(status().isOk());
        mvc.perform(post("/enterprise/admin/v1/mcp-grants").header("Idempotency-Key", grantKey)
                .contentType(MediaType.APPLICATION_JSON).content(grantBody)).andExpect(status().isOk());
        assertThat(store.listGrants(TENANT, 0, 200).stream().filter(value -> value.serverId() == serverId)).hasSize(1);
    }

    private McpServer server(String tenant) {
        long id = IDS.incrementAndGet();
        return new McpServer(id, tenant, "fixture-" + id, "MCP fixture", "", "streamable-http", "https://mcp.example.test",
            false, Map.of(), Map.of("type", "none"), 60_000, Map.of("enabled", true), "search", McpServer.Status.ACTIVE,
            0, USER, Instant.now(), Instant.now());
    }

    private McpGrant grant(long server, McpGrant.SubjectType type, Long subject) {
        return new McpGrant(IDS.incrementAndGet(), TENANT, server, type, subject, McpGrant.Status.ACTIVE, 0, USER, Instant.now(), Instant.now());
    }
}
