/**
 * [INPUT]: 依赖可信 DeviceRequestContextResolver、最小 request parser、ModelGatewayService 与 byte 上限配置。
 * [OUTPUT]: 提供三种 Harness 原生 wire POST 路径、建连前 JSON 错误和原协议 SSE 响应。
 * [POS]: model/gateway 的唯一 HTTP 入口，限制正文并只转发协议所需的非凭据 header。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.common.api.EnterpriseApiValidation;
import org.dromara.enterprise.common.api.EnterpriseRequestIds;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.device.web.DeviceRequestContextResolver;
import org.dromara.enterprise.model.domain.ProviderApiProtocol;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@RestController
@RequestMapping("/enterprise/gateway/v1")
public final class ModelGatewayController {
    private static final MediaType EVENT_STREAM = MediaType.parseMediaType("text/event-stream;charset=UTF-8");
    private static final List<String> FORWARDED_HEADERS = List.of(
        "anthropic-beta", "anthropic-version", "openai-organization", "openai-project",
        "session_id", "x-client-request-id", "x-session-affinity", "x-session-id"
    );

    private final DeviceRequestContextResolver contexts;
    private final GatewayChatRequestParser parser;
    private final ModelGatewayService gateway;
    private final int maxRequestBytes;

    public ModelGatewayController(
        DeviceRequestContextResolver contexts,
        GatewayChatRequestParser parser,
        ModelGatewayService gateway,
        EnterpriseGatewayProperties properties
    ) {
        this.contexts = Objects.requireNonNull(contexts, "contexts");
        this.parser = Objects.requireNonNull(parser, "parser");
        this.gateway = Objects.requireNonNull(gateway, "gateway");
        Objects.requireNonNull(properties, "properties").validate();
        this.maxRequestBytes = properties.getMaxRequestBytes();
    }

    @PostMapping(path = "/chat/completions", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> completions(
        HttpServletRequest request,
        @RequestHeader("Idempotency-Key") UUID idempotencyKey
    ) {
        return stream(request, idempotencyKey, ProviderApiProtocol.OPENAI_COMPLETIONS);
    }

    @PostMapping(path = "/responses", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> responses(
        HttpServletRequest request,
        @RequestHeader("Idempotency-Key") UUID idempotencyKey
    ) {
        return stream(request, idempotencyKey, ProviderApiProtocol.OPENAI_RESPONSES);
    }

    @PostMapping(path = "/messages", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> messages(
        HttpServletRequest request,
        @RequestHeader("Idempotency-Key") UUID idempotencyKey
    ) {
        return stream(request, idempotencyKey, ProviderApiProtocol.ANTHROPIC_MESSAGES);
    }

    private ResponseEntity<StreamingResponseBody> stream(
        HttpServletRequest servletRequest,
        UUID idempotencyKey,
        ProviderApiProtocol protocol
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        GatewayChatRequest request = parser.parse(readLimited(servletRequest), protocol);
        DeviceCallContext context = contexts.resolve(servletRequest);
        ModelGatewayService.GatewayStream stream = gateway.open(
            context, request, protocol, forwardedHeaders(servletRequest), idempotencyKey
        );
        StreamingResponseBody body = stream::writeTo;
        return ResponseEntity.ok()
            .contentType(EVENT_STREAM)
            .cacheControl(CacheControl.noStore())
            .header(EnterpriseRequestIds.HEADER, context.requestId())
            .header(HttpHeaders.CONNECTION, "keep-alive")
            .header("X-Accel-Buffering", "no")
            .body(body);
    }

    private static Map<String, String> forwardedHeaders(HttpServletRequest request) {
        Map<String, String> headers = new LinkedHashMap<>();
        for (String name : FORWARDED_HEADERS) {
            String value = request.getHeader(name);
            if (value != null && !value.isBlank()) headers.put(name, value);
        }
        return Map.copyOf(headers);
    }

    private byte[] readLimited(HttpServletRequest request) {
        long contentLength = request.getContentLengthLong();
        if (contentLength > maxRequestBytes) throw new GatewayException(GatewayException.Kind.REQUEST_TOO_LARGE);
        try (InputStream input = request.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) >= 0) {
                if (read == 0) continue;
                if (total > maxRequestBytes - read) throw new GatewayException(GatewayException.Kind.REQUEST_TOO_LARGE);
                output.write(buffer, 0, read);
                total += read;
            }
            return output.toByteArray();
        } catch (GatewayException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new IllegalArgumentException("请求体读取失败", exception);
        }
    }
}
