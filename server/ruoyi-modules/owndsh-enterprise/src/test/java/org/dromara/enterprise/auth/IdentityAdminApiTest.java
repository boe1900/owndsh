/**
 * [INPUT]: 依赖身份源/LDAP 目录/外部组/用户组/用户摘要 Controller、MockMvc 与派生 JSON Schema。
 * [OUTPUT]: 验证身份、LDAP 搜索/导入与用户组 operation、权限/revision 及秘密不出响应。
 * [POS]: T04/T12 身份管理 HTTP 契约门禁，领域服务使用 mock 以把测试焦点限定在协议翻译和权限入口。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.networknt.schema.Error;
import com.networknt.schema.InputFormat;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;
import org.dromara.enterprise.auth.adapter.IdentitySourceConnection;
import org.dromara.enterprise.auth.application.AccessGroupService;
import org.dromara.enterprise.auth.application.ExternalIdentityQueryService;
import org.dromara.enterprise.auth.application.IdentityGroupMappingService;
import org.dromara.enterprise.auth.application.IdentityLinkResult;
import org.dromara.enterprise.auth.application.IdentitySourceService;
import org.dromara.enterprise.auth.application.LdapDirectoryService;
import org.dromara.enterprise.auth.application.SecretInput;
import org.dromara.enterprise.auth.domain.AccessGroup;
import org.dromara.enterprise.auth.domain.ExternalGroupMapping;
import org.dromara.enterprise.auth.domain.ExternalIdentitySummary;
import org.dromara.enterprise.auth.domain.IdentityProvisioningMode;
import org.dromara.enterprise.auth.domain.IdentityPrincipal;
import org.dromara.enterprise.auth.domain.IdentitySource;
import org.dromara.enterprise.auth.domain.IdentitySourceStatus;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.domain.LdapDirectory;
import org.dromara.enterprise.auth.domain.OidcSettings;
import org.dromara.enterprise.auth.web.AdminGroupMappingController;
import org.dromara.enterprise.auth.web.AdminExternalIdentityController;
import org.dromara.enterprise.auth.web.AdminAccessGroupController;
import org.dromara.enterprise.auth.web.AdminIdentitySourceController;
import org.dromara.enterprise.auth.web.EnterpriseRequestContext;
import org.dromara.enterprise.auth.web.IdentityAdminRequestContextResolver;
import org.dromara.enterprise.auth.web.IdentitySourceWriteRequest;
import org.dromara.enterprise.common.api.EnterpriseExceptionHandler;
import org.dromara.enterprise.common.api.EnterpriseCursorCodec;
import org.dromara.enterprise.common.api.EnterpriseRequestIdFilter;
import org.dromara.enterprise.common.api.EnterpriseRequestIds;
import org.dromara.enterprise.crypto.EncryptedSecret;
import org.dromara.enterprise.revision.RevisionConflictException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.lang.reflect.Method;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

@Tag("dev")
class IdentityAdminApiTest {
    private static final String SOURCE_ID = "1900600000000000001";
    private static final String MAPPING_ID = "1900600000000000101";
    private static final String ACCESS_GROUP_ID = "1900600000000000201";
    private static final String IDEMPOTENCY_KEY = "123e4567-e89b-42d3-a456-426614174000";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final SchemaRegistry SCHEMAS =
        SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12);
    private static final Path CONTRACT_ROOT = findContractRoot();

    private IdentitySourceService sources;
    private LdapDirectoryService ldap;
    private IdentityGroupMappingService mappings;
    private AccessGroupService accessGroups;
    private ExternalIdentityQueryService externalIdentities;
    private EnterpriseCursorCodec cursors;
    private MockMvc mvc;
    private IdentitySource source;
    private ExternalGroupMapping mapping;
    private AccessGroup accessGroup;

    @BeforeEach
    void setUp() {
        sources = mock(IdentitySourceService.class);
        ldap = mock(LdapDirectoryService.class);
        mappings = mock(IdentityGroupMappingService.class);
        accessGroups = mock(AccessGroupService.class);
        externalIdentities = mock(ExternalIdentityQueryService.class);
        cursors = new EnterpriseCursorCodec(new org.dromara.enterprise.crypto.SecretCipher(new byte[32]));
        source = source();
        mapping = new ExternalGroupMapping(
            Long.parseLong(MAPPING_ID), "000000", Long.parseLong(SOURCE_ID),
            "engineering", Long.parseLong(ACCESS_GROUP_ID), 0
        );
        accessGroup = new AccessGroup(
            Long.parseLong(ACCESS_GROUP_ID), "000000", "Engineering",
            List.of(1761100000000000001L), 1, 0
        );
        IdentityAdminRequestContextResolver contexts = request -> new EnterpriseRequestContext(
            "000000",
            1761100000000000001L,
            EnterpriseRequestIds.current(request),
            "127.0.0.1",
            new byte[32]
        );
        mvc = standaloneSetup(
            new AdminIdentitySourceController(sources, ldap, contexts, cursors),
            new AdminGroupMappingController(mappings, contexts, cursors),
            new AdminAccessGroupController(accessGroups, contexts, cursors),
            new AdminExternalIdentityController(externalIdentities, contexts)
        ).setControllerAdvice(new EnterpriseExceptionHandler())
            .addFilters(new EnterpriseRequestIdFilter())
            .build();

        when(sources.list("000000", 0, 51)).thenReturn(List.of(source));
        when(sources.get("000000", source.id())).thenReturn(source);
        when(sources.create(any(), any(), any(SecretInput.class))).thenAnswer(invocation -> {
            SecretInput secret = invocation.getArgument(2);
            assertThat(new String(secret.value())).isEqualTo("api-secret-never-returned");
            return source;
        });
        when(sources.update(any(), anyLong(), anyLong(), any(), nullable(SecretInput.class))).thenReturn(source);
        when(sources.testConnection("000000", source.id()))
            .thenReturn(IdentitySourceConnection.ready(IdentitySourceType.OIDC));
        when(sources.setStatus(any(), anyLong(), anyLong(), any())).thenReturn(source);
        IdentityPrincipal ldapPrincipal = new IdentityPrincipal(
            SOURCE_ID, IdentitySourceType.LDAP, "stable-alice", "alice", "Alice LDAP",
            "alice@example.org", List.of("cn=engineering,ou=groups,dc=example,dc=org")
        );
        when(ldap.searchUsers("000000", source.id(), "alice", 50)).thenReturn(List.of(
            new LdapDirectory.User("uid=alice,ou=people,dc=example,dc=org", ldapPrincipal)
        ));
        when(ldap.searchGroups("000000", source.id(), "engineer", 50)).thenReturn(List.of(
            new LdapDirectory.Group("cn=engineering,ou=groups,dc=example,dc=org", "engineering")
        ));
        when(ldap.importUser(any(), anyLong(), anyString()))
            .thenReturn(new IdentityLinkResult(1761100000000000001L, true, true));
        when(mappings.list("000000", source.id(), 0, 51)).thenReturn(List.of(mapping));
        when(mappings.create(any(), anyLong(), anyString(), anyLong())).thenReturn(mapping);
        when(accessGroups.list("000000", 0, 51)).thenReturn(List.of(accessGroup));
        when(accessGroups.get("000000", accessGroup.id())).thenReturn(accessGroup);
        when(accessGroups.create(any(), anyString(), any())).thenReturn(accessGroup);
        when(accessGroups.update(any(), anyLong(), anyLong(), anyString(), any())).thenReturn(accessGroup);
        when(externalIdentities.summaries("000000", 1761100000000000001L)).thenReturn(List.of(
            new ExternalIdentitySummary(
                source.id(), source.name(), source.type(), "stable-subject-001", Instant.parse("2026-08-18T03:30:00Z")
            )
        ));
    }

    @Test
    void executesEveryIdentityOperationWithGeneratedSuccessSchemas() throws Exception {
        assertResponse(
            mvc.perform(get("/enterprise/admin/v1/identity-sources"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
            "IdentitySourceListResponse"
        );
        assertResponse(
            mvc.perform(get("/enterprise/admin/v1/identity-sources/{id}", SOURCE_ID))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
            "IdentitySourceResponse"
        );
        assertResponse(
            mvc.perform(post("/enterprise/admin/v1/identity-sources")
                    .header("Idempotency-Key", IDEMPOTENCY_KEY)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(sourceRequest(true)))
                .andExpect(status().isCreated())
                .andExpect(header().string(EnterpriseRequestIds.HEADER, org.hamcrest.Matchers.startsWith("req_")))
                .andExpect(jsonPath("$.data.secret").doesNotExist())
                .andExpect(jsonPath("$.data.encryptedSecret").doesNotExist())
                .andReturn().getResponse().getContentAsString(),
            "IdentitySourceResponse"
        );
        assertResponse(
            mvc.perform(put("/enterprise/admin/v1/identity-sources/{id}", SOURCE_ID)
                    .header("If-Match", "0")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(sourceRequest(false)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
            "IdentitySourceResponse"
        );
        assertResponse(
            mvc.perform(post("/enterprise/admin/v1/identity-sources/{id}/actions/test", SOURCE_ID))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
            "IdentitySourceTestResponse"
        );
        for (String action : List.of("enable", "disable")) {
            assertResponse(
                mvc.perform(post("/enterprise/admin/v1/identity-sources/{id}/actions/{action}", SOURCE_ID, action)
                        .header("If-Match", "0"))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
                "IdentitySourceResponse"
            );
        }
        assertResponse(
            mvc.perform(get("/enterprise/admin/v1/identity-sources/{id}/ldap/users", SOURCE_ID)
                    .queryParam("query", "alice"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].dn").value("uid=alice,ou=people,dc=example,dc=org"))
                .andReturn().getResponse().getContentAsString(),
            "LdapDirectoryUserSearchResponse"
        );
        assertResponse(
            mvc.perform(get("/enterprise/admin/v1/identity-sources/{id}/ldap/groups", SOURCE_ID)
                    .queryParam("query", "engineer"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].externalGroup").value("cn=engineering,ou=groups,dc=example,dc=org"))
                .andReturn().getResponse().getContentAsString(),
            "LdapDirectoryGroupSearchResponse"
        );
        assertResponse(
            mvc.perform(post("/enterprise/admin/v1/identity-sources/{id}/ldap/users/actions/import", SOURCE_ID)
                    .header("Idempotency-Key", IDEMPOTENCY_KEY)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"dn\":\"uid=alice,ou=people,dc=example,dc=org\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.created").value(true))
                .andReturn().getResponse().getContentAsString(),
            "LdapMemberImportResponse"
        );
        assertResponse(
            mvc.perform(get("/enterprise/admin/v1/group-mappings").queryParam("sourceId", SOURCE_ID))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
            "GroupMappingListResponse"
        );
        assertResponse(
            mvc.perform(post("/enterprise/admin/v1/group-mappings")
                    .header("Idempotency-Key", IDEMPOTENCY_KEY)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""
                        {"sourceId":"%s","externalGroup":"engineering","accessGroupId":"%s"}
                        """.formatted(SOURCE_ID, ACCESS_GROUP_ID)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(),
            "GroupMappingResponse"
        );
        assertResponse(
            mvc.perform(delete("/enterprise/admin/v1/group-mappings/{id}", MAPPING_ID).header("If-Match", "0"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
            "DeletedResourceResponse"
        );
        mvc.perform(get("/enterprise/admin/v1/access-groups"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.items[0].id").value(ACCESS_GROUP_ID));
        assertResponse(
            mvc.perform(get("/enterprise/admin/v1/access-groups/{id}", ACCESS_GROUP_ID))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
            "AccessGroupResponse"
        );
        assertResponse(
            mvc.perform(post("/enterprise/admin/v1/access-groups")
                    .header("Idempotency-Key", IDEMPOTENCY_KEY)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"Engineering\",\"memberIds\":[\"1761100000000000001\"]}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(),
            "AccessGroupResponse"
        );
        assertResponse(
            mvc.perform(put("/enterprise/admin/v1/access-groups/{id}", ACCESS_GROUP_ID)
                    .header("If-Match", "0")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"Engineering\",\"memberIds\":[\"1761100000000000001\"]}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
            "AccessGroupResponse"
        );
        assertResponse(
            mvc.perform(delete("/enterprise/admin/v1/access-groups/{id}", ACCESS_GROUP_ID).header("If-Match", "0"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(),
            "DeletedResourceResponse"
        );
        assertResponse(
            mvc.perform(get("/enterprise/admin/v1/users/{userId}/identity-summary", "1761100000000000001"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].externalSubject").value("stable-subject-001"))
                .andExpect(jsonPath("$.data[0].lastGroups").doesNotExist())
                .andReturn().getResponse().getContentAsString(),
            "ExternalIdentitySummaryResponse"
        );
    }

    @Test
    void pagesWithTenantAndFilterBoundOpaqueCursors() throws Exception {
        IdentitySource second = source(1900600000000000002L, "Second SSO");
        when(sources.list("000000", 0, 2)).thenReturn(List.of(source, second));
        when(sources.list("000000", source.id(), 2)).thenReturn(List.of(second));

        String firstBody = mvc.perform(get("/enterprise/admin/v1/identity-sources").queryParam("limit", "1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.items[0].id").value(SOURCE_ID))
            .andExpect(jsonPath("$.data.page.hasMore").value(true))
            .andReturn().getResponse().getContentAsString();
        assertResponse(firstBody, "IdentitySourceListResponse");
        String cursor = JSON.readTree(firstBody).get("data").get("page").get("nextCursor").asString();

        String secondBody = mvc.perform(get("/enterprise/admin/v1/identity-sources")
                .queryParam("limit", "1")
                .queryParam("cursor", cursor))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.items[0].id").value(Long.toString(second.id())))
            .andExpect(jsonPath("$.data.page.hasMore").value(false))
            .andExpect(jsonPath("$.data.page.nextCursor").isEmpty())
            .andReturn().getResponse().getContentAsString();
        assertResponse(secondBody, "IdentitySourceListResponse");

        mvc.perform(get("/enterprise/admin/v1/group-mappings")
                .queryParam("sourceId", SOURCE_ID)
                .queryParam("cursor", cursor))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("ENT_INVALID_REQUEST"));
        mvc.perform(get("/enterprise/admin/v1/identity-sources").queryParam("limit", "201"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("ENT_INVALID_REQUEST"));
    }

    @Test
    void mapsRevisionConflictToStableSchemaWithoutEchoingSecret() throws Exception {
        when(sources.update(any(), anyLong(), anyLong(), any(), nullable(SecretInput.class)))
            .thenThrow(new RevisionConflictException(0, 2));

        String body = mvc.perform(put("/enterprise/admin/v1/identity-sources/{id}", SOURCE_ID)
                .header("If-Match", "0")
                .contentType(MediaType.APPLICATION_JSON)
                .content(sourceRequest(true)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error.code").value("ENT_REVISION_CONFLICT"))
            .andExpect(jsonPath("$.error.details.expectedRevision").value(0))
            .andExpect(jsonPath("$.error.details.actualRevision").value(2))
            .andReturn().getResponse().getContentAsString();

        assertResponse(body, "EnterpriseErrorResponse");
        assertThat(body).doesNotContain("api-secret-never-returned");
    }

    @Test
    void rejectsNonV4IdempotencyKeyThroughEnterpriseErrorEnvelope() throws Exception {
        String body = mvc.perform(post("/enterprise/admin/v1/identity-sources")
                .header("Idempotency-Key", "123e4567-e89b-12d3-a456-426614174000")
                .contentType(MediaType.APPLICATION_JSON)
                .content(sourceRequest(true)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("ENT_INVALID_REQUEST"))
            .andReturn().getResponse().getContentAsString();

        assertResponse(body, "EnterpriseErrorResponse");
        assertThat(body).doesNotContain("api-secret-never-returned");
    }

    @Test
    void protectsEveryOperationWithFrozenIdentityPermissionCodes() {
        assertPermissions(AdminIdentitySourceController.class, Map.of(
            "list", "ent:identity:read",
            "get", "ent:identity:read",
            "create", "ent:identity:write",
            "update", "ent:identity:write",
            "test", "ent:identity:write",
            "enable", "ent:identity:write",
            "disable", "ent:identity:write",
            "searchLdapUsers", "ent:member:write",
            "importLdapUser", "ent:member:write",
            "searchLdapGroups", "ent:identity:read"
        ));
        assertPermissions(AdminGroupMappingController.class, Map.of(
            "list", "ent:identity:read",
            "create", "ent:identity:write",
            "delete", "ent:identity:write"
        ));
        assertPermissions(AdminAccessGroupController.class, Map.of(
            "list", "ent:member:read", "get", "ent:member:read", "create", "ent:member:write",
            "update", "ent:member:write", "delete", "ent:member:write"
        ));
        assertPermissions(AdminExternalIdentityController.class, Map.of(
            "summaries", "ent:identity:read"
        ));
    }

    @Test
    void clearsSecretRequestAndKeepsStringRepresentationRedacted() {
        IdentitySourceWriteRequest request = new IdentitySourceWriteRequest(
            IdentitySourceType.OIDC,
            IdentityProvisioningMode.JIT,
            "Corporate SSO",
            URI.create("https://identity.example.test"),
            "enterprise-agent",
            OidcSettings.defaults(),
            null,
            "sensitive-value".toCharArray()
        );

        assertThat(request.toString()).doesNotContain("sensitive-value").contains("[REDACTED]");
        request.close();
        assertThat(request.secret()).containsOnly('\0');
    }

    private static void assertPermissions(Class<?> controller, Map<String, String> expected) {
        Map<String, String> actual = new java.util.HashMap<>();
        for (Method method : controller.getDeclaredMethods()) {
            SaCheckPermission permission = method.getAnnotation(SaCheckPermission.class);
            if (permission != null) actual.put(method.getName(), permission.value()[0]);
        }
        assertThat(actual).containsExactlyInAnyOrderEntriesOf(expected);
    }

    private static void assertResponse(String body, String schemaName) throws Exception {
        Path schemaPath = CONTRACT_ROOT.resolve("generated/schemas/" + schemaName + ".schema.json");
        Schema schema = SCHEMAS.getSchema(Files.readString(schemaPath), InputFormat.JSON);
        List<Error> errors = schema.validate(body, InputFormat.JSON);
        assertThat(errors).as(body).isEmpty();

        JsonNode json = JSON.readTree(body);
        assertThat(json.get("requestId") == null
            ? json.get("error").get("requestId").asString()
            : json.get("requestId").asString()).matches("^req_[0-9A-HJKMNP-TV-Z]{26}$");
    }

    private static IdentitySource source() {
        return source(Long.parseLong(SOURCE_ID), "Corporate SSO");
    }

    private static IdentitySource source(long id, String name) {
        Instant created = Instant.parse("2026-08-18T03:00:00Z");
        return new IdentitySource(
            id,
            "000000",
            IdentitySourceType.OIDC,
            name,
            URI.create("https://identity.example.test"),
            "enterprise-agent",
            new EncryptedSecret(new byte[16], new byte[12], 1),
            OidcSettings.defaults(),
            null,
            IdentitySourceStatus.ACTIVE,
            0,
            created,
            created
        );
    }

    private static String sourceRequest(boolean includeSecret) {
        String secret = includeSecret ? ",\"secret\":\"api-secret-never-returned\"" : "";
        return """
            {
              "type":"OIDC",
              "provisioningMode":"JIT",
              "name":"Corporate SSO",
              "issuer":"https://identity.example.test",
              "clientId":"enterprise-agent",
              "oidc":{
                "scopes":["openid","profile","email"],
                "claims":{
                  "username":"preferred_username",
                  "displayName":"name",
                  "email":"email",
                  "groups":"groups"
                }
              }%s
            }
            """.formatted(secret);
    }

    private static Path findContractRoot() {
        Path current = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        while (current != null) {
            Path candidate = current.resolve("contracts");
            if (Files.isRegularFile(candidate.resolve("enterprise-openapi.yaml"))) return candidate;
            current = current.getParent();
        }
        throw new IllegalStateException("cannot locate contracts/enterprise-openapi.yaml");
    }
}
