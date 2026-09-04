/**
 * [INPUT]: 依赖 EnterpriseHttpProperties、JsonMapper、requestId 与不可信 JSON Servlet 输入流。
 * [OUTPUT]: 对外提供不受 Content-Length/chunked 影响的有界请求 wrapper 与稳定 413 envelope。
 * [POS]: common/api 的 MVC 解序列化前置边界；gateway 流与 multipart 继续由专用限制处理。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.json.JsonMapper;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public final class EnterpriseJsonBodyLimitFilter extends OncePerRequestFilter {
    private static final Set<String> GATEWAY_PATHS = Set.of(
        "/enterprise/gateway/v1/chat/completions",
        "/enterprise/gateway/v1/responses",
        "/enterprise/gateway/v1/messages"
    );
    private static final Set<String> BODY_METHODS = Set.of("POST", "PUT", "PATCH");

    private final JsonMapper json;
    private final int maxRequestBytes;

    public EnterpriseJsonBodyLimitFilter(JsonMapper json, EnterpriseHttpProperties properties) {
        this.json = json;
        this.maxRequestBytes = properties.getMaxJsonRequestBytes();
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!request.getRequestURI().startsWith("/enterprise/")) return true;
        if (GATEWAY_PATHS.contains(request.getRequestURI())) return true;
        if (!BODY_METHODS.contains(request.getMethod().toUpperCase(Locale.ROOT))) return true;
        return !isJson(request.getContentType());
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        if (request.getContentLengthLong() > maxRequestBytes) {
            reject(request, response);
            return;
        }
        byte[] body = readLimited(request);
        if (body == null) {
            reject(request, response);
            return;
        }
        filterChain.doFilter(new CachedBodyRequest(request, body), response);
    }

    private byte[] readLimited(HttpServletRequest request) throws IOException {
        int initialSize = request.getContentLengthLong() > 0
            ? (int) Math.min(request.getContentLengthLong(), maxRequestBytes)
            : 1024;
        try (var input = request.getInputStream(); var output = new ByteArrayOutputStream(initialSize)) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                if (read == 0) continue;
                if (total > maxRequestBytes - read) return null;
                output.write(buffer, 0, read);
                total += read;
            }
            return output.toByteArray();
        }
    }

    private void reject(HttpServletRequest request, HttpServletResponse response) throws IOException {
        String requestId = EnterpriseRequestIds.current(request);
        var error = new EnterpriseErrorResponse(new EnterpriseError(
            "ENT_REQUEST_TOO_LARGE", "请求体过大", requestId, false, null
        ));
        response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader(EnterpriseRequestIds.HEADER, requestId);
        response.setHeader("Cache-Control", "no-store");
        response.getWriter().write(json.writeValueAsString(error));
    }

    private static boolean isJson(String contentType) {
        if (contentType == null) return false;
        try {
            MediaType mediaType = MediaType.parseMediaType(contentType);
            return MediaType.APPLICATION_JSON.includes(mediaType) || mediaType.getSubtype().endsWith("+json");
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    private static final class CachedBodyRequest extends HttpServletRequestWrapper {
        private final byte[] body;

        private CachedBodyRequest(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body.clone();
        }

        @Override
        public ServletInputStream getInputStream() {
            return new ByteArrayServletInputStream(body);
        }

        @Override
        public BufferedReader getReader() {
            String encoding = getCharacterEncoding();
            Charset charset = encoding == null ? StandardCharsets.UTF_8 : Charset.forName(encoding);
            return new BufferedReader(new InputStreamReader(getInputStream(), charset));
        }

        @Override
        public int getContentLength() {
            return body.length;
        }

        @Override
        public long getContentLengthLong() {
            return body.length;
        }
    }

    private static final class ByteArrayServletInputStream extends ServletInputStream {
        private final ByteArrayInputStream input;

        private ByteArrayServletInputStream(byte[] body) {
            this.input = new ByteArrayInputStream(body);
        }

        @Override
        public int read() {
            return input.read();
        }

        @Override
        public int read(byte[] buffer, int offset, int length) {
            return input.read(buffer, offset, length);
        }

        @Override
        public boolean isFinished() {
            return input.available() == 0;
        }

        @Override
        public boolean isReady() {
            return true;
        }

        @Override
        public void setReadListener(ReadListener listener) {
            if (listener == null) throw new IllegalArgumentException("listener 不能为 null");
            try {
                if (!isFinished()) listener.onDataAvailable();
                if (isFinished()) listener.onAllDataRead();
            } catch (IOException exception) {
                listener.onError(exception);
            }
        }
    }
}
