/**
 * [INPUT]: 依赖 PlatformAuthorizationService、固定 enterprise 配置、可信 metadata 与 HTTPS 密码/首次改密表单。
 * [OUTPUT]: 提供 authorize/sources/password/OIDC start+callback/token/logout，并把浏览器密码失败与首次改密重定向回原事务。
 * [POS]: auth/web 的最小平台登录门面，只翻译协议并把当前/新密码生命周期限制在单次请求内。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.auth.EnterpriseIdentityProperties;
import org.dromara.enterprise.auth.application.AuthFlowException;
import org.dromara.enterprise.auth.application.IdentityLoginContext;
import org.dromara.enterprise.auth.application.PlatformAuthorizationService;
import org.dromara.enterprise.auth.application.PasswordChangeRequiredException;
import org.dromara.enterprise.auth.application.TokenExchangeResult;
import org.dromara.enterprise.auth.domain.PlatformClient;
import org.dromara.enterprise.common.api.EnterpriseRequestMetadata;
import org.dromara.enterprise.common.api.EnterpriseResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.Arrays;
import java.util.UUID;

@RestController
@RequestMapping("/enterprise/auth/v1")
public final class PlatformAuthController {
    private final PlatformAuthorizationService authorization;
    private final String tenantId;

    public PlatformAuthController(
        PlatformAuthorizationService authorization,
        EnterpriseIdentityProperties properties
    ) {
        this.authorization = authorization;
        this.tenantId = properties.getTenantId();
    }

    @GetMapping("/authorize")
    public ResponseEntity<Void> authorize(
        @RequestParam("client_id") String clientId,
        @RequestParam("redirect_uri") String redirectUri,
        @RequestParam String state,
        @RequestParam("code_challenge") String codeChallenge,
        @RequestParam("code_challenge_method") String codeChallengeMethod,
        @RequestParam(value = "installation_id", required = false) String installationId
    ) {
        String transactionId = authorization.authorize(
            client(clientId),
            uri(redirectUri, "ENT_INVALID_REDIRECT_URI"),
            state,
            codeChallengeMethod,
            codeChallenge,
            optionalUuidV4(installationId)
        );
        return ResponseEntity.status(HttpStatus.SEE_OTHER)
            .location(URI.create("/enterprise/auth/login.html?transaction_id=" + transactionId))
            .build();
    }

    @GetMapping("/sources")
    public EnterpriseResponse<AuthSourcesView> sources(
        @RequestParam("transaction_id") String transactionId,
        HttpServletRequest request
    ) {
        EnterpriseRequestMetadata metadata = EnterpriseRequestMetadata.from(request);
        return new EnterpriseResponse<>(
            AuthSourcesView.from(authorization.sources(tenantId, transactionId)),
            metadata.requestId()
        );
    }

    @PostMapping("/password")
    public ResponseEntity<Void> password(
        @RequestParam String transactionId,
        @RequestParam String sourceId,
        @RequestParam String csrfToken,
        @RequestParam String username,
        @RequestParam String password,
        @RequestParam(required = false) String newPassword,
        @RequestParam(required = false) String captchaId,
        @RequestParam(required = false) String captchaCode,
        HttpServletRequest request
    ) {
        requireHttps(request);
        EnterpriseRequestMetadata metadata = EnterpriseRequestMetadata.from(request);
        char[] passwordChars = password.toCharArray();
        char[] newPasswordChars = newPassword == null || newPassword.isEmpty() ? null : newPassword.toCharArray();
        try {
            long parsedSourceId = positiveId(sourceId);
            try {
                URI callback = authorization.password(
                    tenantId,
                    transactionId,
                    parsedSourceId,
                    csrfToken,
                    username,
                    passwordChars,
                    newPasswordChars,
                    captchaId,
                    captchaCode,
                    loginContext(metadata)
                );
                return ResponseEntity.status(HttpStatus.SEE_OTHER).location(callback).build();
            } catch (PasswordChangeRequiredException exception) {
                String changeState = exception.rejected() ? "rejected" : "required";
                return ResponseEntity.status(HttpStatus.SEE_OTHER)
                    .location(loginRetry(transactionId, parsedSourceId, changeState, false))
                    .build();
            } catch (AuthFlowException exception) {
                if (!"ENT_AUTH_REQUIRED".equals(exception.code()) || !acceptsHtml(request)) throw exception;
                String changeState = newPasswordChars == null ? null : "required";
                return ResponseEntity.status(HttpStatus.SEE_OTHER)
                    .location(loginRetry(transactionId, parsedSourceId, changeState, true))
                    .build();
            }
        } finally {
            Arrays.fill(passwordChars, '\0');
            if (newPasswordChars != null) Arrays.fill(newPasswordChars, '\0');
        }
    }

    @GetMapping("/oidc/{sourceId}/start")
    public ResponseEntity<Void> oidcStart(
        @PathVariable String sourceId,
        @RequestParam("transaction_id") String transactionId
    ) {
        return ResponseEntity.status(HttpStatus.FOUND)
            .location(authorization.startOidc(tenantId, transactionId, positiveId(sourceId)))
            .build();
    }

    @GetMapping("/oidc/{sourceId}/callback")
    public ResponseEntity<Void> oidcCallback(
        @PathVariable String sourceId,
        @RequestParam String state,
        @RequestParam String code,
        HttpServletRequest request
    ) {
        EnterpriseRequestMetadata metadata = EnterpriseRequestMetadata.from(request);
        return ResponseEntity.status(HttpStatus.FOUND)
            .location(authorization.oidcCallback(
                tenantId, positiveId(sourceId), state, code, loginContext(metadata)
            ))
            .build();
    }

    @PostMapping("/token")
    public EnterpriseResponse<TokenExchangeResult> token(
        @RequestBody TokenExchangeRequest body,
        HttpServletRequest request
    ) {
        if (!"authorization_code".equals(body.grantType())) {
            throw new AuthFlowException("ENT_INVALID_REQUEST");
        }
        TokenExchangeResult result = authorization.exchange(
            body.code(),
            client(body.clientId()),
            uri(body.redirectUri(), "ENT_AUTH_CODE_INVALID"),
            body.codeVerifier(),
            optionalUuidV4(body.installationId())
        );
        return new EnterpriseResponse<>(result, EnterpriseRequestMetadata.from(request).requestId());
    }

    @PostMapping("/logout")
    public EnterpriseResponse<LogoutView> logout(HttpServletRequest request) {
        EnterpriseRequestMetadata metadata = EnterpriseRequestMetadata.from(request);
        authorization.logout(tenantId, loginContext(metadata));
        return new EnterpriseResponse<>(new LogoutView(true), metadata.requestId());
    }

    private IdentityLoginContext loginContext(EnterpriseRequestMetadata metadata) {
        return new IdentityLoginContext(
            tenantId, metadata.requestId(), metadata.sourceIp(), metadata.userAgentHash()
        );
    }

    private static PlatformClient client(String value) {
        try {
            return PlatformClient.parse(value);
        } catch (IllegalArgumentException exception) {
            throw new AuthFlowException("ENT_INVALID_REQUEST");
        }
    }

    private static URI uri(String value, String errorCode) {
        try {
            URI uri = URI.create(value);
            if (!uri.isAbsolute()) throw new IllegalArgumentException("not absolute");
            return uri;
        } catch (RuntimeException exception) {
            throw new AuthFlowException(errorCode);
        }
    }

    private static UUID optionalUuidV4(String value) {
        if (value == null) return null;
        try {
            UUID uuid = UUID.fromString(value);
            if (uuid.version() != 4) throw new IllegalArgumentException("not v4");
            return uuid;
        } catch (IllegalArgumentException exception) {
            throw new AuthFlowException("ENT_INVALID_REQUEST");
        }
    }

    private static long positiveId(String value) {
        try {
            long id = Long.parseLong(value);
            if (id <= 0) throw new NumberFormatException("not positive");
            return id;
        } catch (NumberFormatException exception) {
            throw new AuthFlowException("ENT_INVALID_REQUEST");
        }
    }

    private static void requireHttps(HttpServletRequest request) {
        if (!request.isSecure()) throw new AuthFlowException("ENT_INVALID_REQUEST");
    }

    private static boolean acceptsHtml(HttpServletRequest request) {
        String accept = request.getHeader(HttpHeaders.ACCEPT);
        if (accept == null) return false;
        try {
            return MediaType.parseMediaTypes(accept).stream()
                .anyMatch(mediaType -> !mediaType.isWildcardType()
                    && MediaType.TEXT_HTML.isCompatibleWith(mediaType));
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static URI loginRetry(
        String transactionId,
        long sourceId,
        String passwordChangeState,
        boolean loginError
    ) {
        String location = "/enterprise/auth/login.html?transaction_id=" + transactionId
            + "&source_id=" + sourceId;
        if (passwordChangeState != null) location += "&password_change=" + passwordChangeState;
        if (loginError) location += "&login_error=1";
        return URI.create(location);
    }

    public record LogoutView(boolean loggedOut) {
    }
}
