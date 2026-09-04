/**
 * [INPUT]: 依赖成员治理服务、外部 HTTP(S) 地址、可信 enterprise-admin Cookie 会话和一次性密码字符请求。
 * [OUTPUT]: 提供当前控制台用户校验旧密码后的 LOCAL 密码修改，并删除已撤销的浏览器 Cookie。
 * [POS]: auth/web 的当前账号边界，不授予管理员重置他人密码的旁路，成功后撤销该用户全部会话。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.owndsh.enterprise.auth.EnterpriseIdentityProperties;
import com.owndsh.enterprise.auth.application.MemberManagementService;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.net.URI;

@RestController
@RequestMapping("/enterprise/admin/v1/account")
public final class CurrentAccountController {
    private final MemberManagementService members;
    private final IdentityAdminRequestContextResolver contexts;
    private final URI publicBaseUrl;

    public CurrentAccountController(
        MemberManagementService members,
        IdentityAdminRequestContextResolver contexts,
        EnterpriseIdentityProperties properties
    ) {
        this.members = members;
        this.contexts = contexts;
        this.publicBaseUrl = properties.getPublicBaseUrl();
    }

    @PutMapping("/password")
    public EnterpriseResponse<PasswordChangedView> changePassword(
        @RequestBody PasswordChangeRequest body,
        HttpServletRequest request,
        HttpServletResponse response
    ) {
        if (body == null) throw new IllegalArgumentException("改密请求不能为空");
        EnterpriseRequestContext context = contexts.resolve(request);
        try (body) {
            members.changeLocalPassword(
                context.tenantId(), context.actorId(), body.currentPassword(), body.newPassword()
            );
        }
        response.addHeader(HttpHeaders.SET_COOKIE, AdminSessionCookie.clear(publicBaseUrl));
        return new EnterpriseResponse<>(new PasswordChangedView(true), context.requestId());
    }

    public record PasswordChangeRequest(char[] currentPassword, char[] newPassword) implements AutoCloseable {
        public PasswordChangeRequest {
            currentPassword = currentPassword == null ? null : currentPassword.clone();
            newPassword = newPassword == null ? null : newPassword.clone();
        }

        @Override
        public char[] currentPassword() {
            return currentPassword == null ? null : currentPassword.clone();
        }

        @Override
        public char[] newPassword() {
            return newPassword == null ? null : newPassword.clone();
        }

        @Override
        public void close() {
            if (currentPassword != null) Arrays.fill(currentPassword, '\0');
            if (newPassword != null) Arrays.fill(newPassword, '\0');
        }

        @Override
        public String toString() {
            return "PasswordChangeRequest[currentPassword=[REDACTED], newPassword=[REDACTED]]";
        }
    }

    public record PasswordChangedView(boolean changed) {
    }
}
