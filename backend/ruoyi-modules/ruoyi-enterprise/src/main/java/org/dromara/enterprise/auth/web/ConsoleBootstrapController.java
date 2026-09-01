/**
 * [INPUT]: 依赖可信 enterprise-admin 请求上下文与 RuoYi 当前用户、角色、权限查询。
 * [OUTPUT]: 提供 GET /enterprise/admin/v1/bootstrap 的成员、启用的固定角色、权限码和部署标识。
 * [POS]: auth/web 的产品控制台会话入口，不投影菜单树、部门或通用 RuoYi 用户 DTO。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.auth.application.AuthFlowException;
import org.dromara.enterprise.common.api.EnterpriseResponse;
import org.dromara.system.domain.vo.SysRoleVo;
import org.dromara.system.domain.vo.SysUserVo;
import org.dromara.system.service.ISysPermissionService;
import org.dromara.system.service.ISysRoleService;
import org.dromara.system.service.ISysUserService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/enterprise/admin/v1/bootstrap")
public final class ConsoleBootstrapController {
    private static final String DEPLOYMENT_NAME = "Enterprise Agent Platform";
    private static final Set<String> BUILT_IN_ROLES = Set.of(
        "enterprise_admin", "model_admin", "plugin_admin", "auditor", "employee"
    );

    private final IdentityAdminRequestContextResolver contexts;
    private final ISysUserService users;
    private final ISysRoleService roles;
    private final ISysPermissionService permissions;

    public ConsoleBootstrapController(
        IdentityAdminRequestContextResolver contexts,
        ISysUserService users,
        ISysRoleService roles,
        ISysPermissionService permissions
    ) {
        this.contexts = contexts;
        this.users = users;
        this.roles = roles;
        this.permissions = permissions;
    }

    @GetMapping
    public EnterpriseResponse<ConsoleBootstrapView> get(HttpServletRequest request) {
        EnterpriseRequestContext context = contexts.resolve(request);
        SysUserVo user = users.selectUserById(context.actorId());
        if (user == null || !"0".equals(user.getStatus())) throw new AuthFlowException("ENT_AUTH_REQUIRED");

        List<String> roleKeys = roles.selectRolesByUserId(context.actorId()).stream()
            .filter(role -> "0".equals(role.getStatus()))
            .map(SysRoleVo::getRoleKey)
            .filter(BUILT_IN_ROLES::contains)
            .distinct()
            .sorted()
            .toList();
        List<String> permissionKeys = permissions.getMenuPermission(context.actorId()).stream()
            .sorted()
            .toList();
        String displayName = user.getNickName() == null || user.getNickName().isBlank()
            ? user.getUserName()
            : user.getNickName();
        String avatarUrl = user.getAvatarUrl() == null || user.getAvatarUrl().isBlank()
            ? null
            : user.getAvatarUrl();

        return new EnterpriseResponse<>(
            new ConsoleBootstrapView(
                new ConsoleMemberView(Long.toString(context.actorId()), displayName, avatarUrl),
                roleKeys,
                permissionKeys,
                new ConsoleDeploymentView(DEPLOYMENT_NAME)
            ),
            context.requestId()
        );
    }

    public record ConsoleBootstrapView(
        ConsoleMemberView member,
        List<String> roles,
        List<String> permissions,
        ConsoleDeploymentView deployment
    ) {
    }

    public record ConsoleMemberView(String id, String displayName, String avatarUrl) {
    }

    public record ConsoleDeploymentView(String name) {
    }
}
