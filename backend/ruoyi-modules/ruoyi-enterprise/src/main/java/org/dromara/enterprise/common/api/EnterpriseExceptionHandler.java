/**
 * [INPUT]: 依赖身份/revision 领域异常、Sa-Token 异常、Spring MVC 绑定异常与当前 requestId。
 * [OUTPUT]: 对外提供详细设计第 17 节稳定 status/code/retryable/error envelope。
 * [POS]: common/api 的企业 Controller 专用异常边界，优先于 RuoYi 通用 R 响应处理器。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.common.api;

import cn.dev33.satoken.exception.NotLoginException;
import cn.dev33.satoken.exception.NotPermissionException;
import cn.dev33.satoken.exception.NotRoleException;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.dromara.enterprise.auth.adapter.IdentityAuthenticationException;
import org.dromara.enterprise.auth.adapter.IdentitySourceConfigurationException;
import org.dromara.enterprise.auth.application.IdentityAlreadyLinkedException;
import org.dromara.enterprise.auth.application.IdentityResourceNotFoundException;
import org.dromara.enterprise.revision.RevisionConflictException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * 企业 API 稳定异常映射。
 */
@Slf4j
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(basePackages = "org.dromara.enterprise")
public final class EnterpriseExceptionHandler {
    @ExceptionHandler(RevisionConflictException.class)
    public ResponseEntity<EnterpriseErrorResponse> revision(
        RevisionConflictException exception,
        HttpServletRequest request
    ) {
        return error(
            HttpStatus.CONFLICT,
            RevisionConflictException.ERROR_CODE,
            "资源已被其他请求修改",
            false,
            new RevisionConflictDetails(exception.currentRevision(), exception.expectedRevision()),
            request
        );
    }

    @ExceptionHandler(IdentityResourceNotFoundException.class)
    public ResponseEntity<EnterpriseErrorResponse> notFound(HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "ENT_RESOURCE_NOT_FOUND", "身份资源不存在", false, null, request);
    }

    @ExceptionHandler(IdentityAlreadyLinkedException.class)
    public ResponseEntity<EnterpriseErrorResponse> alreadyLinked(HttpServletRequest request) {
        return error(HttpStatus.CONFLICT, "ENT_IDENTITY_ALREADY_LINKED", "外部身份已绑定", false, null, request);
    }

    @ExceptionHandler(IdentityAuthenticationException.class)
    public ResponseEntity<EnterpriseErrorResponse> authentication(HttpServletRequest request) {
        return error(HttpStatus.UNAUTHORIZED, "ENT_AUTH_REQUIRED", "身份认证失败", false, null, request);
    }

    @ExceptionHandler({NotPermissionException.class, NotRoleException.class})
    public ResponseEntity<EnterpriseErrorResponse> permission(HttpServletRequest request) {
        return error(HttpStatus.FORBIDDEN, "ENT_PERMISSION_DENIED", "没有访问权限", false, null, request);
    }

    @ExceptionHandler(NotLoginException.class)
    public ResponseEntity<EnterpriseErrorResponse> notLogin(HttpServletRequest request) {
        return error(HttpStatus.UNAUTHORIZED, "ENT_AUTH_REQUIRED", "需要登录", false, null, request);
    }

    @ExceptionHandler({
        IdentitySourceConfigurationException.class,
        IllegalArgumentException.class,
        DataIntegrityViolationException.class,
        ServletException.class,
        HttpMessageNotReadableException.class,
        MethodArgumentTypeMismatchException.class
    })
    public ResponseEntity<EnterpriseErrorResponse> invalidRequest(HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "ENT_INVALID_REQUEST", "请求参数不合法", false, null, request);
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<EnterpriseErrorResponse> unexpected(RuntimeException exception, HttpServletRequest request) {
        String requestId = EnterpriseRequestIds.current(request);
        log.error("企业 API 执行失败 requestId={}", requestId, exception);
        return error(
            HttpStatus.SERVICE_UNAVAILABLE,
            "ENT_PLATFORM_UNAVAILABLE",
            "企业平台暂时不可用",
            true,
            null,
            request
        );
    }

    private static ResponseEntity<EnterpriseErrorResponse> error(
        HttpStatus status,
        String code,
        String message,
        boolean retryable,
        Object details,
        HttpServletRequest request
    ) {
        String requestId = EnterpriseRequestIds.current(request);
        EnterpriseErrorResponse body = new EnterpriseErrorResponse(
            new EnterpriseError(code, message, requestId, retryable, details)
        );
        return ResponseEntity.status(status)
            .header(EnterpriseRequestIds.HEADER, requestId)
            .body(body);
    }
}
