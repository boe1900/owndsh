/**
 * [INPUT]: 接收已反序列化的 MCP 管理请求。
 * [OUTPUT]: 提供 RFC 8785 JCS 后的 SHA-256 请求摘要。
 * [POS]: mcp/web 的幂等摘要边界；字段顺序变化不改变同一 JSON 请求的身份。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp.web;

import org.erdtman.jcs.JsonCanonicalizer;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

import tools.jackson.databind.json.JsonMapper;

final class McpRequestFingerprint {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private McpRequestFingerprint() {}

    static String sha256(Object value) {
        try {
            byte[] canonical = new JsonCanonicalizer(JSON.writeValueAsString(value)).getEncodedUTF8();
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical));
        } catch (Exception exception) {
            throw new IllegalStateException("MCP 幂等摘要生成失败", exception);
        }
    }
}
