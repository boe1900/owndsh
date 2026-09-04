/**
 * [INPUT]: 依赖 ConsoleBootstrapController、可信测试上下文与 Host 查询端口 mock。
 * [OUTPUT]: 验证产品 bootstrap 只返回启用的固定角色和 ent:* 产品权限，并稳定投影当前账号与部署信息。
 * [POS]: auth 测试的 P2-03 最小 Server 门禁，防止菜单或任意自定义角色进入控制台协议。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth;

import org.dromara.enterprise.auth.application.MemberDirectoryQueryService;
import org.dromara.enterprise.auth.domain.IdentitySourceType;
import org.dromara.enterprise.auth.web.ConsoleBootstrapController;
import org.dromara.enterprise.auth.web.EnterpriseRequestContext;
import org.dromara.enterprise.auth.web.IdentityAdminRequestContextResolver;
import org.dromara.system.domain.vo.SysUserVo;
import org.dromara.system.service.ISysPermissionService;
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
        MemberDirectoryQueryService members = mock(MemberDirectoryQueryService.class);
        ISysPermissionService permissions = mock(ISysPermissionService.class);
        SysUserVo user = new SysUserVo();
        user.setUserName("candidate.admin");
        user.setNickName("Candidate Admin");
        user.setEmail("candidate.admin@example.org");
        user.setStatus("0");
        when(users.selectUserById(101L)).thenReturn(user);
        when(members.list("000000", 100L, 1)).thenReturn(List.of(
            new MemberDirectoryQueryService.MemberSummary(
                101L, "candidate.admin", "Candidate Admin",
                MemberDirectoryQueryService.MemberStatus.ACTIVE,
                List.of("custom_role", "enterprise_admin"),
                List.of(
                    new MemberDirectoryQueryService.MemberLoginMethod(
                        null, "本地", IdentitySourceType.LOCAL, null
                    ),
                    new MemberDirectoryQueryService.MemberLoginMethod(
                        1919100000000000191L, "Corporate LDAP", IdentitySourceType.LDAP, null
                    )
                ),
                null,
                1L
            )
        ));
        when(permissions.getMenuPermission(101L)).thenReturn(Set.of(
            "ent:model:write", "ent:model:read", "system:user:list", "monitor:online:list"
        ));

        var response = new ConsoleBootstrapController(contexts, users, members, permissions)
            .get(new MockHttpServletRequest());

        assertThat(response.data().member().displayName()).isEqualTo("Candidate Admin");
        assertThat(response.data().member().username()).isEqualTo("candidate.admin");
        assertThat(response.data().member().email()).isEqualTo("candidate.admin@example.org");
        assertThat(response.data().member().loginMethods())
            .extracting(ConsoleBootstrapController.ConsoleLoginMethodView::sourceType)
            .containsExactly("LOCAL", "LDAP");
        assertThat(response.data().roles()).containsExactly("enterprise_admin");
        assertThat(response.data().permissions()).containsExactly("ent:model:read", "ent:model:write");
        assertThat(response.data().deployment().name()).isEqualTo("OwnDsh");
    }
}
