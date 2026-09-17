/**
 * [INPUT]: 接收 tenant 内 MCP 公共连接配置。
 * [OUTPUT]: 提供不可变 MCP server 聚合，API Key 仅声明目标 Header，禁止承载用户凭据或拼接前缀。
 * [POS]: mcp/domain 的配置根；管理端和 runtime snapshot 共享其字段不变量。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.mcp.domain;

import java.time.Instant;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

public record McpServer(
    long id, String tenantId, String serverName, String displayName, String description,
    String transport, String url, boolean allowInsecureTransport, Map<String, String> headers,
    Map<String, Object> auth, int toolCallTimeoutMs, Map<String, Object> reconnect,
    String presentation, Status status, long revision,
    long createdBy, Instant createdAt, Instant updatedAt
) {
    private static final Pattern NAME = Pattern.compile("^[a-z][a-z0-9_-]*$");
    private static final Pattern HEADER = Pattern.compile("^[!#$%&'*+.^_`|~0-9A-Za-z-]+$");
    private static final Set<String> RESERVED_HEADERS = Set.of("proxy-authorization", "cookie", "set-cookie", "host", "content-length", "connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "mcp-session-id", "mcp-protocol-version");

    public McpServer {
        if (id <= 0 || revision < 0 || createdBy <= 0) throw new IllegalArgumentException("MCP ID/revision 非法");
        tenantId = text(tenantId, "tenantId", 20); serverName = text(serverName, "serverName", 32);
        if (!NAME.matcher(serverName).matches()) throw new IllegalArgumentException("serverName 非法");
        displayName = text(displayName, "displayName", 120); description = Objects.requireNonNull(description, "description");
        if (description.length() > 1000 || !"streamable-http".equals(transport)) throw new IllegalArgumentException("MCP transport/description 非法");
        url = text(url, "url", 2048); headers = Map.copyOf(Objects.requireNonNull(headers, "headers"));
        auth = Map.copyOf(Objects.requireNonNull(auth, "auth")); validateAuth(auth); validateHeaders(headers, auth); reconnect = Map.copyOf(Objects.requireNonNull(reconnect, "reconnect"));
        if (toolCallTimeoutMs < 1000 || toolCallTimeoutMs > 300000) throw new IllegalArgumentException("MCP timeout 非法");
        if (!presentation.equals("search") && !presentation.equals("full")) throw new IllegalArgumentException("MCP presentation 非法");
        Objects.requireNonNull(status, "status"); Objects.requireNonNull(createdAt, "createdAt"); Objects.requireNonNull(updatedAt, "updatedAt");
    }

    private static String text(String value, String name, int max) {
        Objects.requireNonNull(value, name); if (value.isBlank() || value.length() > max) throw new IllegalArgumentException(name + " 非法"); return value;
    }
    private static void validateAuth(Map<String, Object> auth) {
        String type = auth.get("type") instanceof String v ? v : "";
        Set<String> allowed;
        if ("none".equals(type)) allowed = Set.of("type");
        else if ("api-key".equals(type)) {
            allowed = Set.of("type", "headerName");
            if (!(auth.get("headerName") instanceof String h) || h.length() > 128 || !HEADER.matcher(h).matches()
                || RESERVED_HEADERS.contains(h.toLowerCase(Locale.ROOT))) throw new IllegalArgumentException("MCP API Key auth 非法");
        } else if ("oauth".equals(type)) {
            allowed = Set.of("type", "issuer", "resource", "clientId", "dynamicRegistration", "scopes", "authorizationEndpoint", "tokenEndpoint");
            if (!(auth.get("issuer") instanceof String) || !(auth.get("resource") instanceof String)
                || !https((String) auth.get("issuer")) || !https((String) auth.get("resource"))
                || !(auth.get("scopes") instanceof List<?> scopes) || scopes.size() > 32 || scopes.stream().anyMatch(v -> !(v instanceof String s) || s.isBlank() || s.length() > 128)) throw new IllegalArgumentException("MCP OAuth auth 非法");
            boolean dynamic = Boolean.TRUE.equals(auth.get("dynamicRegistration"));
            if ((dynamic && auth.get("clientId") != null) || (!dynamic && !(auth.get("clientId") instanceof String id && !id.isBlank() && id.length() <= 255))) throw new IllegalArgumentException("MCP OAuth clientRegistration 非法");
            for (String endpoint : List.of("authorizationEndpoint", "tokenEndpoint")) if (auth.get(endpoint) != null && !(auth.get(endpoint) instanceof String s && https(s))) throw new IllegalArgumentException("MCP OAuth endpoint 非法");
        } else throw new IllegalArgumentException("MCP auth type 非法");
        if (!allowed.containsAll(auth.keySet())) throw new IllegalArgumentException("MCP auth 字段非法");
    }
    private static void validateHeaders(Map<String, String> headers, Map<String, Object> auth) {
        if (headers.size() > 16) throw new IllegalArgumentException("固定请求头最多 16 项");
        Set<String> names = new HashSet<>();
        int bytes = 0;
        for (var entry : headers.entrySet()) {
            String name = entry.getKey(), value = entry.getValue(), normalized = name.toLowerCase(Locale.ROOT);
            if (!HEADER.matcher(name).matches() || !names.add(normalized)) throw new IllegalArgumentException("固定请求头名称非法或重复");
            if (RESERVED_HEADERS.contains(normalized) || "authorization".equals(normalized)
                || ("api-key".equals(auth.get("type")) && name.equalsIgnoreCase((String) auth.get("headerName")))) throw new IllegalArgumentException("固定请求头不能覆盖认证或协议请求头");
            if (value.length() > 1024 || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0 || value.indexOf('\0') >= 0) throw new IllegalArgumentException("固定请求头值非法");
            bytes += (name + value).getBytes(StandardCharsets.UTF_8).length;
        }
        if (bytes > 8192) throw new IllegalArgumentException("固定请求头合计不能超过 8 KiB");
    }
    private static boolean https(String value) { try { URI u = URI.create(value); return "https".equalsIgnoreCase(u.getScheme()) && u.getUserInfo() == null && u.getFragment() == null; } catch (RuntimeException e) { return false; } }
    public enum Status { ACTIVE, DISABLED }
}
