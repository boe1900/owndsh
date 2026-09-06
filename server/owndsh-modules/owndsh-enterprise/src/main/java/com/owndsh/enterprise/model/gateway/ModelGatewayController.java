/**
 * [INPUT]: 依赖可信设备 context、request parser、ModelGatewayService、Servlet 可刷出响应流与 byte 上限配置。
 * [OUTPUT]: 提供三种 Harness wire POST、建连前 JSON/流内原协议错误，以及异步错误、超时和完成时的上游清理。
 * [POS]: model/gateway 的唯一 HTTP 入口；SSE 绕过 Spring 通用响应流的非 flush 包装，保留 Servlet 异步生命周期。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.gateway;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.owndsh.enterprise.common.api.EnterpriseApiValidation;
import com.owndsh.enterprise.common.api.EnterpriseRequestIds;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.web.DeviceRequestContextResolver;
import com.owndsh.enterprise.model.domain.ProviderApiProtocol;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.async.CallableProcessingInterceptor;
import org.springframework.web.context.request.async.WebAsyncUtils;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Callable;

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
        HttpServletResponse response,
        @RequestHeader("Idempotency-Key") UUID idempotencyKey
    ) {
        return stream(request, response, idempotencyKey, ProviderApiProtocol.OPENAI_COMPLETIONS);
    }

    @PostMapping(path = "/responses", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> responses(
        HttpServletRequest request,
        HttpServletResponse response,
        @RequestHeader("Idempotency-Key") UUID idempotencyKey
    ) {
        return stream(request, response, idempotencyKey, ProviderApiProtocol.OPENAI_RESPONSES);
    }

    @PostMapping(path = "/messages", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> messages(
        HttpServletRequest request,
        HttpServletResponse response,
        @RequestHeader("Idempotency-Key") UUID idempotencyKey
    ) {
        return stream(request, response, idempotencyKey, ProviderApiProtocol.ANTHROPIC_MESSAGES);
    }

    private ResponseEntity<StreamingResponseBody> stream(
        HttpServletRequest servletRequest,
        HttpServletResponse servletResponse,
        UUID idempotencyKey,
        ProviderApiProtocol protocol
    ) {
        EnterpriseApiValidation.requireUuidV4(idempotencyKey, "Idempotency-Key");
        GatewayChatRequest request = parser.parse(readLimited(servletRequest), protocol);
        DeviceCallContext context = contexts.resolve(servletRequest);
        ModelGatewayService.GatewayStream stream = gateway.open(
            context, request, protocol, forwardedHeaders(servletRequest), idempotencyKey
        );
        WebAsyncUtils.getAsyncManager(servletRequest).registerCallableInterceptor(stream, new CallableProcessingInterceptor() {
            @Override
            public <T> Object handleTimeout(NativeWebRequest request, Callable<T> task) {
                stream.close();
                return RESULT_NONE;
            }

            @Override
            public <T> Object handleError(NativeWebRequest request, Callable<T> task, Throwable error) {
                stream.close();
                return RESULT_NONE;
            }

            @Override
            public <T> void afterCompletion(NativeWebRequest request, Callable<T> task) {
                stream.close();
            }
        });
        // Spring 的通用响应流默认屏蔽 flush；SSE 必须逐事件刷出才能探测下游断开。
        StreamingResponseBody body = ignored -> stream.writeTo(servletResponse.getOutputStream());
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
