/**
 * [INPUT]: 依赖身份/设备/模型/配额/网关/revision 领域异常、Sa-Token 异常、Spring MVC 绑定异常与当前 requestId。
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
import org.dromara.enterprise.auth.application.AuthFlowException;
import org.dromara.enterprise.device.application.DeviceAccessException;
import org.dromara.enterprise.device.application.DeviceBindingConflictException;
import org.dromara.enterprise.device.application.DeviceNotFoundException;
import org.dromara.enterprise.model.application.ModelResourceNotFoundException;
import org.dromara.enterprise.model.gateway.GatewayException;
import org.dromara.enterprise.quota.application.QuotaExceededException;
import org.dromara.enterprise.quota.application.QuotaResourceNotFoundException;
import org.dromara.enterprise.quota.application.RequestAlreadyCompletedException;
import org.dromara.enterprise.quota.application.RequestInProgressException;
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
    @ExceptionHandler(AuthFlowException.class)
    public ResponseEntity<EnterpriseErrorResponse> authFlow(
        AuthFlowException exception,
        HttpServletRequest request
    ) {
        HttpStatus status = switch (exception.code()) {
            case "ENT_INVALID_REQUEST", "ENT_INVALID_REDIRECT_URI", "ENT_PKCE_REQUIRED" -> HttpStatus.BAD_REQUEST;
            default -> HttpStatus.UNAUTHORIZED;
        };
        String message = switch (exception.code()) {
            case "ENT_INVALID_REDIRECT_URI" -> "redirect URI 不合法";
            case "ENT_PKCE_REQUIRED" -> "必须使用 PKCE S256";
            case "ENT_AUTH_CODE_INVALID" -> "授权码无效";
            case "ENT_PKCE_INVALID" -> "PKCE 校验失败";
            case "ENT_AUTH_SESSION_EXPIRED" -> "登录事务已过期";
            case "ENT_AUTH_REQUIRED" -> "身份认证失败";
            default -> "请求参数不合法";
        };
        return error(status, exception.code(), message, false, null, request);
    }

    @ExceptionHandler(DeviceAccessException.class)
    public ResponseEntity<EnterpriseErrorResponse> deviceAccess(
        DeviceAccessException exception,
        HttpServletRequest request
    ) {
        String message = "ENT_DEVICE_REVOKED".equals(exception.code()) ? "设备已撤销" : "没有访问权限";
        return error(HttpStatus.FORBIDDEN, exception.code(), message, false, null, request);
    }

    @ExceptionHandler(DeviceNotFoundException.class)
    public ResponseEntity<EnterpriseErrorResponse> deviceNotFound(HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "ENT_RESOURCE_NOT_FOUND", "设备不存在", false, null, request);
    }

    @ExceptionHandler(DeviceBindingConflictException.class)
    public ResponseEntity<EnterpriseErrorResponse> deviceBindingConflict(
        DeviceBindingConflictException exception,
        HttpServletRequest request
    ) {
        return error(
            HttpStatus.CONFLICT,
            exception.errorCode(),
            "设备已绑定其他用户",
            false,
            null,
            request
        );
    }

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

    @ExceptionHandler(ModelResourceNotFoundException.class)
    public ResponseEntity<EnterpriseErrorResponse> modelNotFound(HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "ENT_RESOURCE_NOT_FOUND", "模型资源不存在", false, null, request);
    }

    @ExceptionHandler(QuotaResourceNotFoundException.class)
    public ResponseEntity<EnterpriseErrorResponse> quotaNotFound(HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "ENT_RESOURCE_NOT_FOUND", "配额资源不存在", false, null, request);
    }

    @ExceptionHandler(GatewayException.class)
    public ResponseEntity<EnterpriseErrorResponse> gateway(
        GatewayException exception,
        HttpServletRequest request
    ) {
        HttpStatus status = switch (exception.kind()) {
            case MODEL_NOT_ASSIGNED -> HttpStatus.FORBIDDEN;
            case REQUEST_TOO_LARGE -> HttpStatus.PAYLOAD_TOO_LARGE;
            case UPSTREAM_AUTH_FAILED, UPSTREAM_INVALID_RESPONSE -> HttpStatus.BAD_GATEWAY;
            case PLATFORM_UNAVAILABLE, UPSTREAM_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
            case UPSTREAM_TIMEOUT -> HttpStatus.GATEWAY_TIMEOUT;
        };
        String message = switch (exception.kind()) {
            case MODEL_NOT_ASSIGNED -> "未分配该企业模型";
            case REQUEST_TOO_LARGE -> "请求体过大";
            case UPSTREAM_AUTH_FAILED -> "模型上游认证失败";
            case UPSTREAM_INVALID_RESPONSE -> "模型上游响应无效";
            case PLATFORM_UNAVAILABLE -> "企业平台暂时不可用";
            case UPSTREAM_UNAVAILABLE -> "模型上游暂时不可用";
            case UPSTREAM_TIMEOUT -> "模型上游响应超时";
        };
        boolean retryable = exception.kind() == GatewayException.Kind.PLATFORM_UNAVAILABLE
            || exception.kind() == GatewayException.Kind.UPSTREAM_UNAVAILABLE
            || exception.kind() == GatewayException.Kind.UPSTREAM_TIMEOUT;
        return error(status, exception.code(), message, retryable, null, request);
    }

    @ExceptionHandler(QuotaExceededException.class)
    public ResponseEntity<EnterpriseErrorResponse> quotaExceeded(
        QuotaExceededException exception,
        HttpServletRequest request
    ) {
        String message = switch (exception.kind()) {
            case DAILY -> "今日 Token 配额已用完";
            case MONTHLY -> "本月 Token 配额已用完";
            case RPM -> "每分钟请求配额已用完";
            case CONCURRENCY -> "并发请求配额已用完";
        };
        return error(
            HttpStatus.TOO_MANY_REQUESTS,
            exception.kind().errorCode(),
            message,
            false,
            new QuotaExceededDetails(Long.toString(exception.policyId()), exception.resetsAt()),
            request
        );
    }

    @ExceptionHandler(RequestInProgressException.class)
    public ResponseEntity<EnterpriseErrorResponse> requestInProgress(
        RequestInProgressException exception,
        HttpServletRequest request
    ) {
        return error(
            HttpStatus.CONFLICT,
            "ENT_REQUEST_IN_PROGRESS",
            "相同请求正在处理中",
            false,
            new RequestConflictDetails(
                exception.originalRequestId(), RequestConflictDetails.Result.IN_PROGRESS
            ),
            request
        );
    }

    @ExceptionHandler(RequestAlreadyCompletedException.class)
    public ResponseEntity<EnterpriseErrorResponse> requestAlreadyCompleted(
        RequestAlreadyCompletedException exception,
        HttpServletRequest request
    ) {
        return error(
            HttpStatus.CONFLICT,
            "ENT_REQUEST_ALREADY_COMPLETED",
            "相同请求已经结束",
            false,
            new RequestConflictDetails(
                exception.originalRequestId(), RequestConflictDetails.Result.COMPLETED
            ),
            request
        );
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
