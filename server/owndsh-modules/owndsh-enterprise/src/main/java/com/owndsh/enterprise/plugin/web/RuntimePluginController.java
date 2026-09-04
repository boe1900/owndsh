/**
 * [INPUT]: 依赖 PluginRuntimeService、可信 DeviceRequestContextResolver 与受控文件系统 artifact。
 * [OUTPUT]: 提供 runtime assignments、带 nosniff 的完整/单 Range tgz 下载和 inventory replacement。
 * [POS]: plugin/web 的 ACTIVE Harness 设备入口，Range 只改变字节窗口而不改变授权路径。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.web;

import jakarta.servlet.http.HttpServletRequest;
import com.owndsh.enterprise.common.api.EnterpriseResponse;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.web.DeviceRequestContextResolver;
import com.owndsh.enterprise.plugin.application.PluginRuntimeService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;

@RestController
@RequestMapping("/enterprise/api/v1/plugins")
public final class RuntimePluginController {
    private static final MediaType TGZ = MediaType.parseMediaType("application/gzip");
    private final PluginRuntimeService runtime;
    private final DeviceRequestContextResolver contexts;

    public RuntimePluginController(PluginRuntimeService runtime, DeviceRequestContextResolver contexts) {
        this.runtime = runtime;
        this.contexts = contexts;
    }

    @GetMapping("/assignments")
    public EnterpriseResponse<PluginViews.RuntimeAssignmentsView> assignments(HttpServletRequest request) {
        DeviceCallContext context = contexts.resolve(request);
        return new EnterpriseResponse<>(PluginViews.runtime(runtime.assignments(context)), context.requestId());
    }

    @GetMapping("/versions/{versionId}/download")
    public ResponseEntity<StreamingResponseBody> download(
        @PathVariable long versionId,
        @RequestHeader(value = "Range", required = false) String rangeHeader,
        HttpServletRequest request
    ) {
        DeviceCallContext context = contexts.resolve(request);
        PluginRuntimeService.AuthorizedDownload download = runtime.authorizeDownload(context, versionId);
        ByteRange range = ByteRange.parse(rangeHeader, download.sizeBytes());
        StreamingResponseBody body = output -> stream(download, range, output);
        ResponseEntity.BodyBuilder response = ResponseEntity.status(range.partial() ? HttpStatus.PARTIAL_CONTENT : HttpStatus.OK)
            .contentType(TGZ)
            .contentLength(range.length())
            .header(HttpHeaders.ACCEPT_RANGES, "bytes")
            .header(HttpHeaders.ETAG, "\"" + download.sha256() + "\"")
            .header("X-Content-Type-Options", "nosniff")
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + download.sha256() + ".tgz\"");
        if (range.partial()) {
            response.header(
                HttpHeaders.CONTENT_RANGE,
                "bytes " + range.start() + "-" + range.end() + "/" + download.sizeBytes()
            );
        }
        return response.body(body);
    }

    @PutMapping("/inventory")
    public EnterpriseResponse<PluginViews.InventoryAck> inventory(
        @RequestBody PluginInventoryRequest body,
        HttpServletRequest request
    ) {
        DeviceCallContext context = contexts.resolve(request);
        int reported = runtime.replaceInventory(context, body.observations());
        return new EnterpriseResponse<>(new PluginViews.InventoryAck(reported), context.requestId());
    }

    private static void stream(
        PluginRuntimeService.AuthorizedDownload download,
        ByteRange range,
        OutputStream output
    ) throws IOException {
        try (InputStream input = Files.newInputStream(download.path())) {
            input.skipNBytes(range.start());
            byte[] buffer = new byte[8192];
            long remaining = range.length();
            while (remaining > 0) {
                int read = input.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                if (read == -1) throw new IOException("artifact 在流式读取期间被截断");
                output.write(buffer, 0, read);
                remaining -= read;
            }
        }
    }

    record ByteRange(long start, long end, boolean partial) {
        static ByteRange parse(String header, long size) {
            if (size <= 0) throw new IllegalArgumentException("artifact 大小非法");
            if (header == null || header.isBlank()) return new ByteRange(0, size - 1, false);
            if (!header.matches("^bytes=[0-9]*-[0-9]*$") || "bytes=-".equals(header)) {
                throw new IllegalArgumentException("只支持单一 bytes Range");
            }
            String[] values = header.substring("bytes=".length()).split("-", -1);
            try {
                long start;
                long end;
                if (values[0].isEmpty()) {
                    long suffix = Long.parseLong(values[1]);
                    if (suffix <= 0) throw new IllegalArgumentException("Range suffix 非法");
                    start = Math.max(0, size - suffix);
                    end = size - 1;
                } else {
                    start = Long.parseLong(values[0]);
                    end = values[1].isEmpty() ? size - 1 : Math.min(Long.parseLong(values[1]), size - 1);
                }
                if (start < 0 || start >= size || end < start) throw new IllegalArgumentException("Range 超出制品范围");
                return new ByteRange(start, end, true);
            } catch (NumberFormatException exception) {
                throw new IllegalArgumentException("Range 数字非法", exception);
            }
        }

        long length() {
            return end - start + 1;
        }
    }
}
