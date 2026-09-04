/**
 * [INPUT]: 依赖可信 enterprise-admin 请求上下文、成员目录与 Host 当前用户/权限查询。
 * [OUTPUT]: 提供 GET /enterprise/admin/v1/bootstrap 的当前账号/登录来源、启用的固定角色、ent:* 产品权限码和部署标识。
 * [POS]: auth/web 的产品控制台会话入口，不投影菜单树、部门或通用 Host 用户 DTO。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.web;

import jakarta.servlet.http.HttpServletRequest;
import com.owndsh.enterprise.auth.application.AuthFlowException;
import com.owndsh.enterprise.auth.application.MemberDirectoryQueryService;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.system.domain.vo.SysUserVo;
import com.owndsh.system.service.ISysPermissionService;
import com.owndsh.system.service.ISysUserService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/enterprise/admin/v1/bootstrap")
public final class ConsoleBootstrapController {
    private static final String DEPLOYMENT_NAME = "OwnDsh";
    private static final Set<String> BUILT_IN_ROLES = Set.of(
        "enterprise_admin", "model_admin", "plugin_admin", "auditor", "employee"
    );

    private final IdentityAdminRequestContextResolver contexts;
    private final ISysUserService users;
    private final MemberDirectoryQueryService members;
    private final ISysPermissionService permissions;

    public ConsoleBootstrapController(
        IdentityAdminRequestContextResolver contexts,
        ISysUserService users,
        MemberDirectoryQueryService members,
        ISysPermissionService permissions
    ) {
        this.contexts = contexts;
        this.users = users;
        this.members = members;
        this.permissions = permissions;
    }

    @GetMapping
    public EnterpriseResponse<ConsoleBootstrapView> get(HttpServletRequest request) {
        EnterpriseRequestContext context = contexts.resolve(request);
        SysUserVo user = users.selectUserById(context.actorId());
        if (user == null || !"0".equals(user.getStatus())) throw new AuthFlowException("ENT_AUTH_REQUIRED");
        MemberDirectoryQueryService.MemberSummary member = members.list(
            context.tenantId(), context.actorId() - 1, 1
        ).stream().filter(item -> item.id() == context.actorId()).findFirst()
            .orElseThrow(() -> new AuthFlowException("ENT_AUTH_REQUIRED"));

        List<String> roleKeys = member.roles().stream()
            .filter(BUILT_IN_ROLES::contains)
            .distinct()
            .sorted()
            .toList();
        List<String> permissionKeys = permissions.getMenuPermission(context.actorId()).stream()
            .filter(permission -> permission.startsWith("ent:"))
            .sorted()
            .toList();
        String displayName = user.getNickName() == null || user.getNickName().isBlank()
            ? user.getUserName()
            : user.getNickName();
        String avatarUrl = user.getAvatarUrl() == null || user.getAvatarUrl().isBlank()
            ? null
            : user.getAvatarUrl();
        String email = user.getEmail() == null || user.getEmail().isBlank() ? null : user.getEmail();

        return new EnterpriseResponse<>(
            new ConsoleBootstrapView(
                new ConsoleMemberView(
                    Long.toString(context.actorId()), user.getUserName(), displayName, email, avatarUrl,
                    member.loginMethods().stream()
                        .map(method -> new ConsoleLoginMethodView(method.sourceName(), method.sourceType().name()))
                        .toList()
                ),
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

    public record ConsoleMemberView(
        String id,
        String username,
        String displayName,
        String email,
        String avatarUrl,
        List<ConsoleLoginMethodView> loginMethods
    ) {
    }

    public record ConsoleLoginMethodView(String sourceName, String sourceType) {
    }

    public record ConsoleDeploymentView(String name) {
    }
}
