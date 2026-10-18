/**
 * [INPUT]: 依赖 PluginMarketController 的受保护索引投影、插件 catalog mock、DSH 会话上下文与安装元数据约束。
 * [OUTPUT]: 验证 DSH Desktop 会话门禁、format 1 只暴露 ACTIVE/PUBLISHED npm 版本，且空展示字段不会生成非法索引。
 * [POS]: plugin/web 的标准市场索引回归；使用 mock 会话，不启动数据库或认证链路。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin;

import com.owndsh.enterprise.auth.application.PlatformSession;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.device.application.DeviceAccessException;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.web.DeviceRequestContextResolver;
import com.owndsh.enterprise.plugin.application.PluginCatalogService;
import com.owndsh.enterprise.plugin.domain.PluginPackage;
import com.owndsh.enterprise.plugin.domain.PluginVersion;
import com.owndsh.enterprise.plugin.domain.PluginInstallation;
import com.owndsh.enterprise.plugin.domain.PluginMarketMetadata;
import com.owndsh.enterprise.plugin.domain.PluginSource;
import com.owndsh.enterprise.plugin.domain.PluginEngines;
import com.owndsh.enterprise.plugin.web.PluginMarketController;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@Tag("dev")
class PluginMarketControllerTest {
    @Test
    @SuppressWarnings("unchecked")
    void emitsOnlyInstallableDshMarketEntries() {
        PluginCatalogService catalog = mock(PluginCatalogService.class);
        DeviceRequestContextResolver contexts = mock(DeviceRequestContextResolver.class);
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        when(contexts.resolve(request)).thenReturn(new DeviceCallContext(
            "000000", new PlatformSession(7, PlatformClient.DSH_DESKTOP, "harness", "device-1"),
            "request-1", "127.0.0.1", null
        ));
        PluginInstallation installation = new PluginInstallation(
            "@example/market-tools@1.0.0", "Market tools", "", "", "", "开发"
        );
        PluginVersion published = new PluginVersion(
            2, "000000", 1, "@example/market-tools", "1.0.0", PluginVersion.Status.PUBLISHED,
            7, Instant.parse("2026-10-17T00:00:00Z"), 0, installation,
            PluginSource.npm("https://registry.example.test"), new PluginEngines(">=0.2.1-rc.2"),
            Instant.parse("2026-10-18T00:00:00Z")
        );
        PluginVersion validated = new PluginVersion(
            3, "000000", 1, "@example/market-tools", "2.0.0", PluginVersion.Status.VALIDATED,
            7, Instant.parse("2026-10-17T00:00:00Z"), 0,
            new PluginInstallation("@example/market-tools@2.0.0", "Market tools", "draft", "", "", "")
        );
        when(catalog.listForMarket("000000")).thenReturn(List.of(
            new PluginCatalogService.CatalogItem(
                new PluginPackage(1, "000000", "@example/market-tools", "Market tools", PluginPackage.Status.ACTIVE, 0),
                List.of(validated, published), List.of()
            ),
            new PluginCatalogService.CatalogItem(
                new PluginPackage(4, "000000", "@example/disabled", "Disabled", PluginPackage.Status.DISABLED, 0),
                List.of(published), List.of()
            )
        ));

        Map<String, Object> index = new PluginMarketController(catalog, contexts).index(request, response);
        verify(response).setHeader("Cache-Control", "no-store");
        verify(response).setHeader("Vary", "Authorization");
        verify(response).setHeader("X-Content-Type-Options", "nosniff");
        assertThat(index).containsEntry("format", 1);
        List<Map<String, Object>> plugins = (List<Map<String, Object>>) index.get("plugins");
        assertThat(plugins).hasSize(1);
        assertThat(plugins.getFirst()).doesNotContainKey("description");
        assertThat((List<?>) plugins.getFirst().get("versions")).hasSize(1);
        Map<String, Object> version = (Map<String, Object>) ((List<?>) plugins.getFirst().get("versions")).getFirst();
        assertThat(version)
            .containsEntry("version", "1.0.0")
            .containsEntry("source", Map.of("type", "npm", "registry", "https://registry.example.test"))
            .containsEntry("publishTimestamp", Instant.parse("2026-10-18T00:00:00Z").getEpochSecond())
            .containsEntry("engines", Map.of("dsh", ">=0.2.1-rc.2"));
        assertThat(plugins.getFirst().get("metadata"))
            .isEqualTo(Map.of("category", "开发", "keywords", List.of(), "labels", List.of(), "sortKeys", Map.of()));
        assertThat(index.get("metadata")).isEqualTo(Map.of(
            "categories", Map.of("开发", Map.of("title", Map.of("en", "开发", "zh", "开发"))),
            "labels", Map.of(),
            "sortKeys", Map.of()
        ));
    }

    @Test
    void rejectsNonDshSessions() {
        PluginCatalogService catalog = mock(PluginCatalogService.class);
        DeviceRequestContextResolver contexts = mock(DeviceRequestContextResolver.class);
        HttpServletRequest request = mock(HttpServletRequest.class);
        HttpServletResponse response = mock(HttpServletResponse.class);
        when(contexts.resolve(request)).thenReturn(new DeviceCallContext(
            "000000", new PlatformSession(7, PlatformClient.ENTERPRISE_ADMIN, "console", "admin"),
            "request-1", "127.0.0.1", null
        ));

        assertThatThrownBy(() -> new PluginMarketController(catalog, contexts).index(request, response))
            .isInstanceOfSatisfying(DeviceAccessException.class,
                exception -> assertThat(exception.code()).isEqualTo("ENT_PERMISSION_DENIED"));
        verifyNoInteractions(catalog);
    }

    @Test
    void acceptsOfficialSemverRangesAndFiniteSortValuesOnly() {
        assertThat(new PluginEngines(">=0.2.1-rc.2 <0.3.0 || ^1.0.0").dsh())
            .isEqualTo(">=0.2.1-rc.2 <0.3.0 || ^1.0.0");
        assertThatThrownBy(() -> new PluginEngines("1.0.0 ||"))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PluginMarketMetadata(
            "title", "", "", "", "", "", "", "", List.of(), List.of(), Map.of("rank", Double.NaN)
        )).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PluginMarketMetadata(
            "title", "", "http://external.example/icon.png", "", "", "", "", "", List.of(), List.of(), Map.of()
        )).isInstanceOf(IllegalArgumentException.class);
    }
}
