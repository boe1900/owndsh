/**
 * [INPUT]: 依赖可信 DeviceRequestContextResolver、严格 request parser、ModelGatewayService 与 byte 上限配置。
 * [OUTPUT]: 提供 `/enterprise/gateway/v1/chat/completions` 的 JSON 输入、首字节前 JSON 错误和 OpenAI SSE 成功响应。
 * [POS]: model/gateway 的唯一 HTTP 入口，手动限量读取以阻止 chunked body 绕过 10 MiB 边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model.gateway;

import jakarta.servlet.http.HttpServletRequest;
import org.dromara.enterprise.common.api.EnterpriseApiValidation;
import org.dromara.enterprise.common.api.EnterpriseRequestIds;
import org.dromara.enterprise.device.application.DeviceCallContext;
import org.dromara.enterprise.device.web.DeviceRequestContextResolver;
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
import java.util.Objects;
import java.util.UUID;

@RestController
@RequestMapping("/enterprise/gateway/v1/chat/completions")
public final class ModelGatewayController {
    private static final MediaType EVENT_STREAM = MediaType.parseMediaType("text/event-stream;charset=UTF-8");

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

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> chat(
        HttpServletRequest servletRequest,
        @RequestHeader("Idempotency-Key") UUID idempotencyKey
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        GatewayChatRequest request = parser.parse(readLimited(servletRequest));
        DeviceCallContext context = contexts.resolve(servletRequest);
        ModelGatewayService.GatewayStream stream = gateway.open(context, request, idempotencyKey);
        StreamingResponseBody body = stream::writeTo;
        return ResponseEntity.ok()
            .contentType(EVENT_STREAM)
            .cacheControl(CacheControl.noStore())
            .header(EnterpriseRequestIds.HEADER, context.requestId())
            .header(HttpHeaders.CONNECTION, "keep-alive")
            .header("X-Accel-Buffering", "no")
            .body(body);
    }

    private byte[] readLimited(HttpServletRequest request) {
        long contentLength = request.getContentLengthLong();
        if (contentLength > maxRequestBytes) {
            throw new GatewayException(GatewayException.Kind.REQUEST_TOO_LARGE);
        }
        try (InputStream input = request.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) >= 0) {
                if (read == 0) continue;
                if (total > maxRequestBytes - read) {
                    throw new GatewayException(GatewayException.Kind.REQUEST_TOO_LARGE);
                }
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
