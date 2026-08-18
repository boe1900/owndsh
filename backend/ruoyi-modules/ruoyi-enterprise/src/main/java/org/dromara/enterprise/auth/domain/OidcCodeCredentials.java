/**
 * [INPUT]: 接收 T05 已校验 state 后留下的授权码、回调 URI、PKCE verifier 与期望 nonce。
 * [OUTPUT]: 对外提供字段校验且字符串表示完全脱敏的 OidcCodeCredentials。
 * [POS]: OIDC adapter 的一次性交换凭据，不承载 state、外部 Token 或原始回调参数。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.domain;

import java.net.URI;
import java.util.Objects;

/**
 * OIDC Authorization Code 交换凭据。
 */
public final class OidcCodeCredentials implements IdentityCredential {
    private final String authorizationCode;
    private final URI redirectUri;
    private final String codeVerifier;
    private final String expectedNonce;

    public OidcCodeCredentials(
        String authorizationCode,
        URI redirectUri,
        String codeVerifier,
        String expectedNonce
    ) {
        this.authorizationCode = requireText(authorizationCode, "authorizationCode");
        this.redirectUri = Objects.requireNonNull(redirectUri, "redirectUri");
        this.codeVerifier = requireText(codeVerifier, "codeVerifier");
        this.expectedNonce = requireText(expectedNonce, "expectedNonce");
    }

    public String authorizationCode() {
        return authorizationCode;
    }

    public URI redirectUri() {
        return redirectUri;
    }

    public String codeVerifier() {
        return codeVerifier;
    }

    public String expectedNonce() {
        return expectedNonce;
    }

    @Override
    public String toString() {
        return "OidcCodeCredentials[authorizationCode=[REDACTED], redirectUri=" + redirectUri
            + ", codeVerifier=[REDACTED], expectedNonce=[REDACTED]]";
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) {
            throw new IllegalArgumentException(name + " 不能为空");
        }
        return value;
    }
}
