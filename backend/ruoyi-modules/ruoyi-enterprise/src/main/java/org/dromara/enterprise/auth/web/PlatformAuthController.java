/**
 * [INPUT]: 依赖 PlatformAuthorizationService、固定 enterprise 配置、可信 request metadata 与 HTTPS 密码/验证码表单。
 * [OUTPUT]: 提供 authorize/sources/password/OIDC start+callback/token/logout 七个 T05 HTTP 入口。
 * [POS]: auth/web 的最小平台登录门面，只翻译协议并把密码生命周期限制在单次请求内。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.web;

import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.auth.EnterpriseIdentityProperties;
import org.dromara.enterprise.auth.application.AuthFlowException;
import org.dromara.enterprise.auth.application.IdentityLoginContext;
import org.dromara.enterprise.auth.application.PlatformAuthorizationService;
import org.dromara.enterprise.auth.application.TokenExchangeResult;
import org.dromara.enterprise.auth.domain.PlatformClient;
import org.dromara.enterprise.common.api.EnterpriseRequestMetadata;
import org.dromara.enterprise.common.api.EnterpriseResponse;
import org.springframework.http.HttpStatus;
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
        @RequestParam(required = false) String captchaId,
        @RequestParam(required = false) String captchaCode,
        HttpServletRequest request
    ) {
        requireHttps(request);
        EnterpriseRequestMetadata metadata = EnterpriseRequestMetadata.from(request);
        char[] passwordChars = password.toCharArray();
        try {
            URI callback = authorization.password(
                tenantId,
                transactionId,
                positiveId(sourceId),
                csrfToken,
                username,
                passwordChars,
                captchaId,
                captchaCode,
                loginContext(metadata)
            );
            return ResponseEntity.status(HttpStatus.SEE_OTHER).location(callback).build();
        } finally {
            Arrays.fill(passwordChars, '\0');
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

    public record LogoutView(boolean loggedOut) {
    }
}
