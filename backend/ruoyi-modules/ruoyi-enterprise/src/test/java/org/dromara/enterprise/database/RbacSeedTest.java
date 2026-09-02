/**
 * [INPUT]: 依赖 V4/V19/V20/V23 固定 sys_role/sys_menu/sys_role_menu seed 与不可变 trigger。
 * [OUTPUT]: 验证五角色、17 权限码、最小角色集合和 built-in 数据库保护。
 * [POS]: T03 RBAC seed 退出门禁，确保权限真源不是 remark 或仅靠 UI 约定。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.database;

import org.dromara.enterprise.test.PostgresTestDatabase;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class RbacSeedTest {
    private static PostgresTestDatabase.Database database;

    @BeforeAll
    static void migrateDatabase() {
        database = PostgresTestDatabase.create("rbac_seed");
        PostgresTestDatabase.migrate(database, null);
    }

    @Test
    void seedsFixedRolesAndEveryFrozenPermissionCode() {
        List<String> roleKeys = database.jdbc().queryForList("""
            select role_key from sys_role where built_in order by role_id
            """, String.class);
        assertThat(roleKeys).containsExactly(
            "enterprise_admin", "model_admin", "plugin_admin", "auditor", "employee"
        );

        List<String> permissions = database.jdbc().queryForList("""
            select perms from sys_menu where perms like 'ent:%' order by perms
            """, String.class);
        assertThat(permissions).containsExactlyInAnyOrder(
            "ent:identity:read", "ent:identity:write",
            "ent:device:read", "ent:device:revoke",
            "ent:model:read", "ent:model:write",
            "ent:grant:read", "ent:grant:write",
            "ent:plugin:read", "ent:plugin:write",
            "ent:session:read", "ent:session:delete", "ent:session:content:read",
            "ent:audit:read", "ent:member:read", "ent:member:write", "ent:usage:read"
        );
    }

    @Test
    void grantsSpecializedRolesOnlyTheirFrozenPermissionSets() {
        assertThat(permissionsFor("model_admin")).containsExactlyInAnyOrder(
            "ent:model:read", "ent:model:write", "ent:grant:read", "ent:grant:write", "ent:member:read",
            "ent:usage:read"
        );
        assertThat(permissionsFor("plugin_admin")).containsExactlyInAnyOrder(
            "ent:plugin:read", "ent:plugin:write", "ent:member:read"
        );
        assertThat(permissionsFor("auditor")).containsExactlyInAnyOrder(
            "ent:usage:read", "ent:session:read", "ent:session:content:read", "ent:audit:read"
        );
        assertThat(permissionsFor("employee")).isEmpty();
    }

    @Test
    void rejectsBuiltInRoleAndPermissionMutationInTheDatabase() {
        assertThatThrownBy(() -> database.jdbc().update("""
            update sys_role set role_name='renamed' where role_key='enterprise_admin'
            """)).isInstanceOf(DataAccessException.class)
            .hasMessageContaining("built-in enterprise roles are immutable");

        assertThatThrownBy(() -> database.jdbc().update("""
            delete from sys_role_menu
            where role_id=1900300000000000002 and menu_id=1900400000000001005
            """)).isInstanceOf(DataAccessException.class)
            .hasMessageContaining("built-in enterprise role permissions are immutable");
    }

    private static List<String> permissionsFor(String roleKey) {
        return database.jdbc().queryForList("""
            select m.perms
            from sys_role r
            join sys_role_menu rm on rm.role_id = r.role_id
            join sys_menu m on m.menu_id = rm.menu_id
            where r.role_key = ? and m.perms like 'ent:%'
            order by m.perms
            """, String.class, roleKey);
    }
}
