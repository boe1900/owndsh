/**
 * [INPUT]: 依赖 PlatformAuthorizationService、固定 enterprise 配置、可信 metadata、HTTPS 密码表单与管理端安全 Cookie。
 * [OUTPUT]: 提供 authorize 的 HTML/同源 JSON 启动、sources/password challenge/OIDC、Desktop Token、浏览器 HttpOnly 会话和 logout。
 * [POS]: auth/web 的平台登录门面，管理端在自身登录页完成 Cookie 会话，Desktop 继续使用跳转与 Bearer Token。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
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
    public ResponseEntity<?> authorize(
        @RequestParam("client_id") String clientId,
        @RequestParam("redirect_uri") String redirectUri,
        @RequestParam String state,
        @RequestParam("code_challenge") String codeChallenge,
        @RequestParam("code_challenge_method") String codeChallengeMethod,
        @RequestParam(value = "installation_id", required = false) String installationId,
        HttpServletRequest request
    ) {
        PlatformClient requestedClient = client(clientId);
        String transactionId = authorization.authorize(
            requestedClient,
            uri(redirectUri, "ENT_INVALID_REDIRECT_URI"),
            state,
            codeChallengeMethod,
            codeChallenge,
            optionalUuidV4(installationId)
        );
        if (requestedClient == PlatformClient.ENTERPRISE_ADMIN
            && acceptsJson(request)
            && !acceptsHtml(request)) {
            EnterpriseRequestMetadata metadata = EnterpriseRequestMetadata.from(request);
            return ResponseEntity.ok(new EnterpriseResponse<>(
                AuthSourcesView.from(authorization.sources(tenantId, transactionId)),
                metadata.requestId()
            ));
        }
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
    public ResponseEntity<?> password(
        @RequestParam String transactionId,
        @RequestParam String sourceId,
        @RequestParam String csrfToken,
        @RequestParam(required = false) String username,
        @RequestParam(required = false) String password,
        @RequestParam(required = false) String newPassword,
        @RequestParam(required = false) String passwordChangeChallenge,
        @RequestParam(required = false) String captchaId,
        @RequestParam(required = false) String captchaCode,
        HttpServletRequest request
    ) {
        requireHttps(request);
        EnterpriseRequestMetadata metadata = EnterpriseRequestMetadata.from(request);
        long parsedSourceId = positiveId(sourceId);
        try {
            URI callback;
            if (passwordChangeChallenge == null || passwordChangeChallenge.isBlank()) {
                char[] passwordChars = required(password).toCharArray();
                try {
                    callback = authorization.password(
                        tenantId, transactionId, parsedSourceId, csrfToken, required(username), passwordChars,
                        captchaId, captchaCode, loginContext(metadata)
                    );
                } finally {
                    Arrays.fill(passwordChars, '\0');
                }
            } else {
                char[] newPasswordChars = required(newPassword).toCharArray();
                try {
                    callback = authorization.changeInitialPassword(
                        tenantId, transactionId, parsedSourceId, csrfToken, passwordChangeChallenge,
                        newPasswordChars, loginContext(metadata)
                    );
                } finally {
                    Arrays.fill(newPasswordChars, '\0');
                }
            }
            if (acceptsJson(request)) {
                return ResponseEntity.ok(new EnterpriseResponse<>(
                    PasswordStepView.redirect(callback), metadata.requestId()
                ));
            }
            return ResponseEntity.status(HttpStatus.SEE_OTHER).location(callback).build();
        } catch (PasswordChangeRequiredException exception) {
            if (!acceptsJson(request)) return ResponseEntity.badRequest().build();
            return ResponseEntity.status(HttpStatus.CONFLICT).body(new EnterpriseResponse<>(
                PasswordStepView.changePassword(exception.challengeToken(), exception.rejected()),
                metadata.requestId()
            ));
        } catch (AuthFlowException exception) {
            if (!"ENT_AUTH_REQUIRED".equals(exception.code()) || !acceptsHtml(request)) throw exception;
            return ResponseEntity.status(HttpStatus.SEE_OTHER)
                .location(loginRetry(transactionId, parsedSourceId))
                .build();
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
        if (body == null) throw new AuthFlowException("ENT_INVALID_REQUEST");
        if (!"authorization_code".equals(body.grantType())) {
            throw new AuthFlowException("ENT_INVALID_REQUEST");
        }
        PlatformClient requestedClient = client(body.clientId());
        if (requestedClient != PlatformClient.DSH_DESKTOP) {
            throw new AuthFlowException("ENT_INVALID_REQUEST");
        }
        TokenExchangeResult result = authorization.exchange(
            body.code(),
            requestedClient,
            uri(body.redirectUri(), "ENT_AUTH_CODE_INVALID"),
            body.codeVerifier(),
            optionalUuidV4(body.installationId())
        );
        return new EnterpriseResponse<>(result, EnterpriseRequestMetadata.from(request).requestId());
    }

    @PostMapping("/browser-session")
    public ResponseEntity<Void> browserSession(
        @RequestBody BrowserSessionExchangeRequest body,
        HttpServletRequest request
    ) {
        requireHttps(request);
        if (body == null) throw new AuthFlowException("ENT_INVALID_REQUEST");
        TokenExchangeResult result = authorization.exchange(
            required(body.code()),
            PlatformClient.ENTERPRISE_ADMIN,
            uri(body.redirectUri(), "ENT_AUTH_CODE_INVALID"),
            required(body.codeVerifier()),
            null
        );
        return ResponseEntity.noContent()
            .header(HttpHeaders.SET_COOKIE, AdminSessionCookie.issue(result.accessToken(), result.expiresIn()))
            .build();
    }

    @PostMapping("/logout")
    public EnterpriseResponse<LogoutView> logout(
        HttpServletRequest request,
        HttpServletResponse response
    ) {
        AdminSessionCookie.requireSameOriginForUnsafe(request);
        response.addHeader(HttpHeaders.SET_COOKIE, AdminSessionCookie.clear());
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

    private static boolean acceptsJson(HttpServletRequest request) {
        String accept = request.getHeader(HttpHeaders.ACCEPT);
        if (accept == null) return false;
        try {
            return MediaType.parseMediaTypes(accept).stream()
                .anyMatch(mediaType -> MediaType.APPLICATION_JSON.isCompatibleWith(mediaType));
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static String required(String value) {
        if (value == null || value.isBlank()) throw new AuthFlowException("ENT_INVALID_REQUEST");
        return value;
    }

    private static URI loginRetry(String transactionId, long sourceId) {
        return URI.create("/enterprise/auth/login.html?transaction_id=" + transactionId
            + "&source_id=" + sourceId + "&login_error=1");
    }

    public record LogoutView(boolean loggedOut) {
    }

    public record BrowserSessionExchangeRequest(String code, String redirectUri, String codeVerifier) {
    }

    public record PasswordStepView(
        String next,
        String redirectUri,
        String passwordChangeChallenge,
        boolean rejected
    ) {
        private static PasswordStepView redirect(URI redirectUri) {
            return new PasswordStepView("REDIRECT", redirectUri.toString(), null, false);
        }

        private static PasswordStepView changePassword(String challenge, boolean rejected) {
            return new PasswordStepView("CHANGE_PASSWORD", null, challenge, rejected);
        }
    }
}
