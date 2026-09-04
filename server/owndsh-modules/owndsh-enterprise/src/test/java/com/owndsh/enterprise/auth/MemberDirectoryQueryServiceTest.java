/**
 * [INPUT]: 依赖真实 PostgreSQL Host/V1-V22 schema、MemberDirectoryQueryService 与成员/身份/设备/Session fixture。
 * [OUTPUT]: 验证成员 cursor、固定角色、LOCAL/OIDC、revision 及单成员脱敏详情聚合。
 * [POS]: auth 测试的产品成员读模型门禁，证明列表不通过逐成员 identity-summary 拼装。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth;

import com.owndsh.enterprise.auth.application.MemberDirectoryQueryService;
import com.owndsh.enterprise.auth.domain.IdentitySourceType;
import com.owndsh.enterprise.test.PostgresTestDatabase;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class MemberDirectoryQueryServiceTest {
    @Test
    void aggregatesMembersRolesAndLoginMethodsByCursorPage() {
        var database = PostgresTestDatabase.create("member_directory");
        PostgresTestDatabase.migrate(database, null);
        long departmentId = database.jdbc().queryForObject(
            "select dept_id from sys_dept where status='0' order by dept_id limit 1", Long.class
        );
        long firstId = 1919000000000000001L;
        long secondId = 1919000000000000002L;
        PostgresTestDatabase.insertActiveUser(database, firstId, departmentId, "first.member", "First Member");
        PostgresTestDatabase.insertActiveUser(database, secondId, departmentId, "second.member", "Second Member");
        database.jdbc().update("update sys_user set status='1' where user_id=?", secondId);
        database.jdbc().update(
            "insert into sys_user_role(user_id,role_id) values (?,1900300000000000001)", firstId
        );
        database.jdbc().update("""
            insert into sys_role(
                role_id,role_name,role_key,role_sort,data_scope,menu_check_strictly,
                dept_check_strictly,status,del_flag,create_time,remark,built_in
            ) values (1919000000000000003,'未来角色','future_role',99,'5',true,true,
                '0','0',now(),'成员目录不得暴露',true)
            """);
        database.jdbc().update(
            "insert into sys_user_role(user_id,role_id) values (?,1919000000000000003)", firstId
        );
        database.jdbc().update("""
            insert into ent_identity_source(
                id,tenant_id,type,name,issuer,client_id,status,revision
            ) values (1919000000000000101,'000000','OIDC','Entra ID',
                'https://login.example.test','client','ACTIVE',0)
            """);
        database.jdbc().update("""
            insert into ent_external_identity(
                id,tenant_id,source_id,user_id,issuer,external_subject,last_groups_json,last_login_at
            ) values (1919000000000000201,'000000',1919000000000000101,?,
                'https://login.example.test','stable-subject','[]','2026-09-01T05:00:00Z')
            """, firstId);
        database.jdbc().update("""
            insert into ent_device(
                id,tenant_id,user_id,installation_id,name,platform,status,last_seen_at,revision
            ) values (1919000000000000301,'000000',?,'123e4567-e89b-42d3-a456-426614174091',
                'First Mac','darwin-arm64','ACTIVE','2026-09-01T05:10:00Z',0)
            """, firstId);
        database.jdbc().update("""
            insert into ent_session_replica(
                id,tenant_id,session_id,owner_user_id,source_device_id,format_version,
                content_key_version,last_seq,event_count,status,created_at,updated_at
            ) values (1919000000000000401,'000000','member-detail',?,1919000000000000301,
                0,1,-1,0,'ACTIVE','2026-09-01T05:00:00Z','2026-09-01T05:09:00Z')
            """, firstId);

        var service = new MemberDirectoryQueryService(database.jdbc());
        var page = service.list("000000", 0, 2);

        assertThat(page).hasSize(2);
        assertThat(page.getFirst().id()).isEqualTo(firstId);
        assertThat(page.getFirst().roles()).containsExactly("enterprise_admin");
        assertThat(page.getFirst().loginMethods()).extracting(MemberDirectoryQueryService.MemberLoginMethod::sourceType)
            .containsExactly(IdentitySourceType.LOCAL, IdentitySourceType.OIDC);
        assertThat(page.getFirst().lastActiveAt()).isEqualTo(Instant.parse("2026-09-01T05:00:00Z"));
        assertThat(page.getFirst().revision()).isZero();
        assertThat(page.get(1).status()).isEqualTo(MemberDirectoryQueryService.MemberStatus.DISABLED);
        assertThat(service.list("000000", firstId, 2)).extracting(MemberDirectoryQueryService.MemberSummary::id)
            .containsExactly(secondId);

        var detail = service.get("000000", firstId);
        assertThat(detail.identities()).extracting(MemberDirectoryQueryService.MemberIdentity::sourceType)
            .containsExactly(IdentitySourceType.LOCAL, IdentitySourceType.OIDC);
        assertThat(detail.identities().get(1).subject()).isEqualTo("stable-subject");
        assertThat(detail.devices()).singleElement().satisfies(device -> {
            assertThat(device.name()).isEqualTo("First Mac");
            assertThat(device.lastSeenAt()).isEqualTo(Instant.parse("2026-09-01T05:10:00Z"));
        });
        assertThat(detail.sessions().active()).isOne();
        assertThat(detail.sessions().latestUpdatedAt()).isEqualTo(Instant.parse("2026-09-01T05:09:00Z"));
    }
}
