/**
 * [INPUT]: 依赖安全随机数、毫秒时钟与当前 HttpServletRequest attribute。
 * [OUTPUT]: 对外提供一次请求内稳定及后台任务可生成的 req_ + canonical ULID requestId。
 * [POS]: common/api 的关联 ID 真源，Controller、filter、错误处理和审计必须复用同一值。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

import jakarta.servlet.http.HttpServletRequest;

import java.math.BigInteger;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Objects;

/**
 * 企业请求 ID 生成与 request attribute 绑定。
 */
public final class EnterpriseRequestIds {
    public static final String HEADER = "X-Request-Id";

    private static final String ATTRIBUTE = EnterpriseRequestIds.class.getName() + ".requestId";
    private static final char[] CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private EnterpriseRequestIds() {
    }

    public static String current(HttpServletRequest request) {
        Objects.requireNonNull(request, "request");
        Object existing = request.getAttribute(ATTRIBUTE);
        if (existing instanceof String requestId) return requestId;
        String requestId = generate(Instant.now().toEpochMilli());
        request.setAttribute(ATTRIBUTE, requestId);
        return requestId;
    }

    public static String generate() {
        return generate(Instant.now().toEpochMilli());
    }

    static String generate(long timestampMillis) {
        if (timestampMillis < 0 || timestampMillis > 0xFFFF_FFFF_FFFFL) {
            throw new IllegalArgumentException("ULID timestamp 超出 48 bit");
        }
        byte[] bytes = new byte[16];
        bytes[0] = (byte) (timestampMillis >>> 40);
        bytes[1] = (byte) (timestampMillis >>> 32);
        bytes[2] = (byte) (timestampMillis >>> 24);
        bytes[3] = (byte) (timestampMillis >>> 16);
        bytes[4] = (byte) (timestampMillis >>> 8);
        bytes[5] = (byte) timestampMillis;
        byte[] randomness = new byte[10];
        RANDOM.nextBytes(randomness);
        System.arraycopy(randomness, 0, bytes, 6, randomness.length);

        BigInteger value = new BigInteger(1, bytes);
        char[] encoded = new char[26];
        BigInteger mask = BigInteger.valueOf(31);
        for (int index = encoded.length - 1; index >= 0; index--) {
            encoded[index] = CROCKFORD[value.and(mask).intValue()];
            value = value.shiftRight(5);
        }
        return "req_" + new String(encoded);
    }
}
