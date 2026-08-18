/**
 * [INPUT]: 接收 RFC 7636 verifier 或 S256 challenge。
 * [OUTPUT]: 对外提供严格 verifier/challenge 校验、S256 派生与恒定时间比较。
 * [POS]: auth 领域的 PKCE 唯一实现，authorize、OIDC 与 token 交换共享同一语义。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.regex.Pattern;

/**
 * PKCE S256 工具。
 */
public final class Pkce {
    private static final Pattern VERIFIER = Pattern.compile("^[A-Za-z0-9._~-]{43,128}$");
    private static final Pattern CHALLENGE = Pattern.compile("^[A-Za-z0-9_-]{43}$");

    private Pkce() {
    }

    public static boolean validVerifier(String value) {
        return value != null && VERIFIER.matcher(value).matches();
    }

    public static boolean validChallenge(String value) {
        return value != null && CHALLENGE.matcher(value).matches();
    }

    public static String challenge(String verifier) {
        if (!validVerifier(verifier)) throw new IllegalArgumentException("PKCE verifier 非法");
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 不可用", exception);
        }
    }

    public static boolean matches(String verifier, String expectedChallenge) {
        if (!validVerifier(verifier) || !validChallenge(expectedChallenge)) return false;
        return MessageDigest.isEqual(
            challenge(verifier).getBytes(StandardCharsets.US_ASCII),
            expectedChallenge.getBytes(StandardCharsets.US_ASCII)
        );
    }
}
