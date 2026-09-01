/**
 * [INPUT]: 依赖 ConsoleBootstrapController、可信测试上下文与 RuoYi 查询端口 mock。
 * [OUTPUT]: 验证产品 bootstrap 只返回启用的固定角色，并稳定投影成员、权限与部署信息。
 * [POS]: auth 测试的 P2-03 最小 Server 门禁，防止菜单或任意自定义角色进入控制台协议。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth;

import org.dromara.enterprise.auth.web.ConsoleBootstrapController;
import org.dromara.enterprise.auth.web.EnterpriseRequestContext;
import org.dromara.enterprise.auth.web.IdentityAdminRequestContextResolver;
import org.dromara.system.domain.vo.SysRoleVo;
import org.dromara.system.domain.vo.SysUserVo;
import org.dromara.system.service.ISysPermissionService;
import org.dromara.system.service.ISysRoleService;
import org.dromara.system.service.ISysUserService;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Tag("dev")
class ConsoleBootstrapControllerTest {
    @Test
    void returnsOnlyEnabledFixedProductRoles() {
        IdentityAdminRequestContextResolver contexts = request ->
            new EnterpriseRequestContext("000000", 101L, "req_test", "127.0.0.1", null);
        ISysUserService users = mock(ISysUserService.class);
        ISysRoleService roles = mock(ISysRoleService.class);
        ISysPermissionService permissions = mock(ISysPermissionService.class);
        SysUserVo user = new SysUserVo();
        user.setUserName("candidate.admin");
        user.setNickName("Candidate Admin");
        user.setStatus("0");
        when(users.selectUserById(101L)).thenReturn(user);
        when(roles.selectRolesByUserId(101L)).thenReturn(List.of(
            role("custom_role", "0"),
            role("enterprise_admin", "0"),
            role("model_admin", "1")
        ));
        when(permissions.getMenuPermission(101L)).thenReturn(Set.of("ent:model:write", "ent:model:read"));

        var response = new ConsoleBootstrapController(contexts, users, roles, permissions)
            .get(new MockHttpServletRequest());

        assertThat(response.data().member().displayName()).isEqualTo("Candidate Admin");
        assertThat(response.data().roles()).containsExactly("enterprise_admin");
        assertThat(response.data().permissions()).containsExactly("ent:model:read", "ent:model:write");
        assertThat(response.data().deployment().name()).isEqualTo("Enterprise Agent Platform");
    }

    private static SysRoleVo role(String key, String status) {
        SysRoleVo role = new SysRoleVo();
        role.setRoleKey(key);
        role.setStatus(status);
        return role;
    }
}
