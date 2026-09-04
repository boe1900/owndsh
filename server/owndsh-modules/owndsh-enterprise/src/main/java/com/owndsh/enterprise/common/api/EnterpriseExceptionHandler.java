/**
 * [INPUT]: 依赖身份/设备/模型/配额/插件/Session/网关/revision 异常、Sa-Token、MVC 绑定与当前 requestId。
 * [OUTPUT]: 对外提供详细设计第 17 节稳定错误 envelope，未知故障日志只保留类型与 requestId。
 * [POS]: common/api 的企业 Controller 专用异常边界，优先于 Host 通用 R 响应处理器。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

import cn.dev33.satoken.exception.NotLoginException;
import cn.dev33.satoken.exception.NotPermissionException;
import cn.dev33.satoken.exception.NotRoleException;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import com.owndsh.enterprise.auth.adapter.IdentityAuthenticationException;
import com.owndsh.enterprise.auth.adapter.IdentitySourceConfigurationException;
import com.owndsh.enterprise.auth.adapter.LocalPasswordChangeRejectedException;
import com.owndsh.enterprise.auth.application.IdentityAlreadyLinkedException;
import com.owndsh.enterprise.auth.application.IdentityResourceNotFoundException;
import com.owndsh.enterprise.auth.application.MemberManagementException;
import com.owndsh.enterprise.auth.application.AuthFlowException;
import com.owndsh.enterprise.device.application.DeviceAccessException;
import com.owndsh.enterprise.device.application.DeviceBindingConflictException;
import com.owndsh.enterprise.device.application.DeviceNotFoundException;
import com.owndsh.enterprise.model.application.ModelResourceNotFoundException;
import com.owndsh.enterprise.model.gateway.GatewayException;
import com.owndsh.enterprise.quota.application.QuotaExceededException;
import com.owndsh.enterprise.quota.application.QuotaResourceNotFoundException;
import com.owndsh.enterprise.plugin.application.PluginAccessException;
import com.owndsh.enterprise.plugin.application.PluginResourceNotFoundException;
import com.owndsh.enterprise.plugin.artifact.PluginArtifactException;
import com.owndsh.enterprise.quota.application.RequestAlreadyCompletedException;
import com.owndsh.enterprise.quota.application.RequestInProgressException;
import com.owndsh.enterprise.revision.RevisionConflictException;
import com.owndsh.enterprise.session.application.SessionException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
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
@RestControllerAdvice(basePackages = "com.owndsh.enterprise")
public final class EnterpriseExceptionHandler {
    @ExceptionHandler(AuthFlowException.class)
    public ResponseEntity<EnterpriseErrorResponse> authFlow(
        AuthFlowException exception,
        HttpServletRequest request
    ) {
        HttpStatus status = switch (exception.code()) {
            case "ENT_INVALID_REQUEST", "ENT_INVALID_REDIRECT_URI", "ENT_PKCE_REQUIRED" -> HttpStatus.BAD_REQUEST;
            case "ENT_DEVICE_REVOKED" -> HttpStatus.FORBIDDEN;
            default -> HttpStatus.UNAUTHORIZED;
        };
        String message = switch (exception.code()) {
            case "ENT_INVALID_REDIRECT_URI" -> "redirect URI 不合法";
            case "ENT_PKCE_REQUIRED" -> "必须使用 PKCE S256";
            case "ENT_AUTH_CODE_INVALID" -> "授权码无效";
            case "ENT_PKCE_INVALID" -> "PKCE 校验失败";
            case "ENT_AUTH_SESSION_EXPIRED" -> "登录事务已过期";
            case "ENT_AUTH_REQUIRED" -> "身份认证失败";
            case "ENT_DEVICE_REVOKED" -> "设备已撤销";
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

    @ExceptionHandler(MemberManagementException.class)
    public ResponseEntity<EnterpriseErrorResponse> member(
        MemberManagementException exception,
        HttpServletRequest request
    ) {
        if (exception.kind() == MemberManagementException.Kind.NOT_FOUND) {
            return error(HttpStatus.NOT_FOUND, "ENT_RESOURCE_NOT_FOUND", "成员不存在", false, null, request);
        }
        if (exception.kind() == MemberManagementException.Kind.LAST_IDENTITY) {
            return error(
                HttpStatus.CONFLICT,
                "ENT_LAST_MEMBER_IDENTITY",
                "成员必须保留至少一种可用登录方式",
                false,
                null,
                request
            );
        }
        if (exception.kind() == MemberManagementException.Kind.USERNAME_EXISTS) {
            return error(HttpStatus.BAD_REQUEST, "ENT_INVALID_REQUEST", "成员账号已存在", false, null, request);
        }
        return error(
            HttpStatus.CONFLICT,
            "ENT_LAST_ENTERPRISE_ADMIN",
            "必须保留至少一个启用的企业管理员",
            false,
            null,
            request
        );
    }

    @ExceptionHandler(LocalPasswordChangeRejectedException.class)
    public ResponseEntity<EnterpriseErrorResponse> localPassword(
        LocalPasswordChangeRejectedException exception,
        HttpServletRequest request
    ) {
        String message = switch (exception.kind()) {
            case CURRENT_PASSWORD_INVALID -> "当前密码不正确";
            case LOCAL_PASSWORD_UNAVAILABLE -> "当前账号没有 LOCAL 密码";
            case NEW_PASSWORD_REJECTED -> "新密码不符合要求";
        };
        return error(HttpStatus.BAD_REQUEST, "ENT_INVALID_REQUEST", message, false, null, request);
    }

    @ExceptionHandler(ModelResourceNotFoundException.class)
    public ResponseEntity<EnterpriseErrorResponse> modelNotFound(HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "ENT_RESOURCE_NOT_FOUND", "模型资源不存在", false, null, request);
    }

    @ExceptionHandler(QuotaResourceNotFoundException.class)
    public ResponseEntity<EnterpriseErrorResponse> quotaNotFound(HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "ENT_RESOURCE_NOT_FOUND", "配额资源不存在", false, null, request);
    }

    @ExceptionHandler(PluginResourceNotFoundException.class)
    public ResponseEntity<EnterpriseErrorResponse> pluginNotFound(HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "ENT_RESOURCE_NOT_FOUND", "插件资源不存在", false, null, request);
    }

    @ExceptionHandler(PluginAccessException.class)
    public ResponseEntity<EnterpriseErrorResponse> pluginNotAssigned(HttpServletRequest request) {
        return error(
            HttpStatus.FORBIDDEN, PluginAccessException.ERROR_CODE, "未分配该插件版本", false, null, request
        );
    }

    @ExceptionHandler(SessionException.class)
    public ResponseEntity<EnterpriseErrorResponse> session(
        SessionException exception,
        HttpServletRequest request
    ) {
        HttpStatus status = switch (exception.kind()) {
            case FORMAT_UNSUPPORTED -> HttpStatus.BAD_REQUEST;
            case BATCH_TOO_LARGE -> HttpStatus.PAYLOAD_TOO_LARGE;
            case SEQ_GAP, DIVERGED, SOURCE_DEVICE_CONFLICT -> HttpStatus.CONFLICT;
            case CONTENT_EXPIRED, NOT_FOUND -> HttpStatus.NOT_FOUND;
        };
        String message = switch (exception.kind()) {
            case FORMAT_UNSUPPORTED -> "Session 格式不受支持";
            case BATCH_TOO_LARGE -> "Session 批次超过限制";
            case SEQ_GAP -> "Session 事件序列存在缺口";
            case DIVERGED -> "Session 事件链已经分叉";
            case SOURCE_DEVICE_CONFLICT -> "Session 已绑定其他源设备";
            case CONTENT_EXPIRED -> "Session 正文已删除或过期";
            case NOT_FOUND -> "Session 不存在";
        };
        return error(status,exception.errorCode(),message,false,null,request);
    }

    @ExceptionHandler(PluginArtifactException.class)
    public ResponseEntity<EnterpriseErrorResponse> pluginArtifact(
        PluginArtifactException exception,
        HttpServletRequest request
    ) {
        HttpStatus status = exception.kind() == PluginArtifactException.Kind.TOO_LARGE
            ? HttpStatus.PAYLOAD_TOO_LARGE
            : HttpStatus.BAD_REQUEST;
        String message = exception.kind() == PluginArtifactException.Kind.TOO_LARGE
            ? "插件归档超过限制"
            : "插件归档无效";
        return error(status, exception.errorCode(), message, false, null, request);
    }

    @ExceptionHandler(GatewayException.class)
    public ResponseEntity<EnterpriseErrorResponse> gateway(
        GatewayException exception,
        HttpServletRequest request
    ) {
        HttpStatus status = switch (exception.kind()) {
            case MODEL_NOT_ASSIGNED -> HttpStatus.FORBIDDEN;
            case REQUEST_TOO_LARGE -> HttpStatus.PAYLOAD_TOO_LARGE;
            case UPSTREAM_RATE_LIMITED, UPSTREAM_QUOTA_EXCEEDED -> HttpStatus.TOO_MANY_REQUESTS;
            case UPSTREAM_AUTH_FAILED, UPSTREAM_INVALID_RESPONSE -> HttpStatus.BAD_GATEWAY;
            case PLATFORM_UNAVAILABLE, UPSTREAM_UNAVAILABLE -> HttpStatus.SERVICE_UNAVAILABLE;
            case UPSTREAM_TIMEOUT -> HttpStatus.GATEWAY_TIMEOUT;
        };
        String message = switch (exception.kind()) {
            case MODEL_NOT_ASSIGNED -> "未分配该企业模型";
            case REQUEST_TOO_LARGE -> "请求体过大";
            case UPSTREAM_AUTH_FAILED -> "模型上游认证失败";
            case UPSTREAM_RATE_LIMITED -> "模型上游请求受限";
            case UPSTREAM_QUOTA_EXCEEDED -> "模型上游额度已用完";
            case UPSTREAM_INVALID_RESPONSE -> "模型上游响应无效";
            case PLATFORM_UNAVAILABLE -> "企业平台暂时不可用";
            case UPSTREAM_UNAVAILABLE -> "模型上游暂时不可用";
            case UPSTREAM_TIMEOUT -> "模型上游响应超时";
        };
        boolean retryable = exception.kind() == GatewayException.Kind.PLATFORM_UNAVAILABLE
            || exception.kind() == GatewayException.Kind.UPSTREAM_RATE_LIMITED
            || exception.kind() == GatewayException.Kind.UPSTREAM_UNAVAILABLE
            || exception.kind() == GatewayException.Kind.UPSTREAM_TIMEOUT;
        ResponseEntity<EnterpriseErrorResponse> response = error(
            status, exception.code(), message, retryable, null, request
        );
        if (exception.retryAfter() == null) return response;
        return ResponseEntity.status(status)
            .headers(headers -> response.getHeaders().forEach(headers::put))
            .header(HttpHeaders.RETRY_AFTER, exception.retryAfter())
            .body(response.getBody());
    }

    @ExceptionHandler(QuotaExceededException.class)
    public ResponseEntity<EnterpriseErrorResponse> quotaExceeded(
        QuotaExceededException exception,
        HttpServletRequest request
    ) {
        String message = switch (exception.kind()) {
            case FIVE_HOURS -> "当前 5 小时 Token 配额已用完";
            case DAILY -> "今日 Token 配额已用完";
            case WEEKLY -> "本周 Token 配额已用完";
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
        log.error("企业 API 执行失败 requestId={} type={}", requestId, exception.getClass().getSimpleName());
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
