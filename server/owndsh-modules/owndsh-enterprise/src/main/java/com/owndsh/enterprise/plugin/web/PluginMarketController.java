/**
 * [INPUT]: 依赖 PluginCatalogService 的已发布插件投影与 DSH Bearer 会话解析器提供的可信 tenant。
 * [OUTPUT]: 提供受 DSH Desktop 会话保护的 DSH plugin market format 1 JSON 索引，不泄露 assignment、inventory 或凭据。
 * [POS]: plugin/web 的标准市场适配器；本机 DSH Host 代理携带内存 Bearer 读取资源并自行安装插件。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import com.owndsh.enterprise.auth.domain.PlatformClient;
import com.owndsh.enterprise.device.application.DeviceAccessException;
import com.owndsh.enterprise.device.application.DeviceCallContext;
import com.owndsh.enterprise.device.web.DeviceRequestContextResolver;
import com.owndsh.enterprise.plugin.application.PluginCatalogService;
import com.owndsh.enterprise.plugin.domain.PluginMarketMetadata;
import com.owndsh.enterprise.plugin.domain.PluginSource;
import com.owndsh.enterprise.plugin.domain.PluginPackage;
import com.owndsh.enterprise.plugin.domain.PluginVersion;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
public final class PluginMarketController {
    private final PluginCatalogService catalog;
    private final DeviceRequestContextResolver contexts;

    public PluginMarketController(
        PluginCatalogService catalog,
        DeviceRequestContextResolver contexts
    ) {
        this.catalog = catalog;
        this.contexts = contexts;
    }

    @GetMapping(path = "/enterprise/plugin-market/index.json", produces = "application/json")
    public Map<String, Object> index(HttpServletRequest request, HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Vary", "Authorization");
        response.setHeader("X-Content-Type-Options", "nosniff");
        DeviceCallContext context = contexts.resolve(request);
        if (context.session().client() != PlatformClient.DSH_DESKTOP) {
            throw new DeviceAccessException("ENT_PERMISSION_DENIED");
        }
        List<PluginCatalogService.CatalogItem> items = catalog.listForMarket(context.tenantId());
        Set<String> categories = new LinkedHashSet<>();
        List<Map<String, Object>> plugins = new ArrayList<>();
        for (PluginCatalogService.CatalogItem item : items) {
            if (item.pluginPackage().status() != PluginPackage.Status.ACTIVE) continue;
            List<PluginVersion> versions = item.versions().stream()
                .filter(version -> version.status() == PluginVersion.Status.PUBLISHED)
                .toList();
            if (versions.isEmpty()) continue;
            PluginMarketMetadata metadata = item.pluginPackage().marketMetadata();
            if (metadata.category().isEmpty() && !versions.getFirst().installation().category().isEmpty()) {
                metadata = PluginMarketMetadata.from(versions.getFirst().installation());
            }
            if (!metadata.category().isEmpty()) categories.add(metadata.category());
            plugins.add(plugin(item.pluginPackage(), versions, metadata));
        }
        Map<String, Object> metadata = new LinkedHashMap<>();
        Map<String, Object> declarations = new LinkedHashMap<>();
        for (String category : categories) {
            declarations.put(category, Map.of("title", Map.of("en", category, "zh", category)));
        }
        metadata.put("categories", declarations);
        Map<String, Object> labels = new LinkedHashMap<>();
        Map<String, Object> sortKeys = new LinkedHashMap<>();
        for (PluginCatalogService.CatalogItem item : items) {
            PluginMarketMetadata value = item.pluginPackage().marketMetadata();
            value.labels().forEach(label -> labels.putIfAbsent(label, Map.of("title", localized(label))));
            value.sortKeys().keySet().forEach(key -> sortKeys.putIfAbsent(key,
                Map.of("title", localized(key), "order", "asc")));
        }
        metadata.put("labels", labels);
        metadata.put("sortKeys", sortKeys);
        return Map.of(
            "format", 1,
            "title", Map.of("en", "OwnDsh Plugin Market", "zh", "OwnDsh 插件市场"),
            "description", Map.of("en", "Plugins published by this OwnDsh server", "zh", "由本 OwnDsh 服务发布的插件"),
            "metadata", metadata,
            "plugins", plugins
        );
    }

    private static Map<String, Object> plugin(
        PluginPackage pluginPackage,
        List<PluginVersion> versions,
        PluginMarketMetadata market
    ) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        if (!market.category().isEmpty()) metadata.put("category", market.category());
        metadata.put("keywords", market.keywords());
        metadata.put("labels", market.labels());
        metadata.put("sortKeys", market.sortKeys());
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("name", pluginPackage.packageName());
        if (!market.title().isEmpty()) value.put("title", localized(market.title()));
        if (!market.description().isEmpty()) value.put("description", localized(market.description()));
        if (!market.icon().isEmpty()) value.put("icon", market.icon());
        if (!market.author().isEmpty()) value.put("author", market.author());
        if (!market.homepage().isEmpty()) value.put("homepage", market.homepage());
        if (!market.repositoryUrl().isEmpty()) {
            Map<String, Object> repository = new LinkedHashMap<>();
            repository.put("url", market.repositoryUrl());
            if (!market.repositoryDirectory().isEmpty()) repository.put("directory", market.repositoryDirectory());
            value.put("repository", repository);
        }
        value.put("metadata", metadata);
        value.put("versions", versions.stream().map(PluginMarketController::version).toList());
        return value;
    }

    private static Map<String, Object> version(PluginVersion value) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("version", value.version());
        result.put("publishTimestamp", (value.publishedAt() == null ? value.createdAt() : value.publishedAt()).getEpochSecond());
        result.put("source", source(value.source()));
        Map<String, Object> engines = new LinkedHashMap<>();
        if (!value.engines().dsh().isEmpty()) engines.put("dsh", value.engines().dsh());
        result.put("engines", engines);
        return result;
    }

    private static Map<String, Object> source(PluginSource value) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("type", value.type());
        if (value.type().equals("npm")) {
            if (!value.registry().isEmpty()) result.put("registry", value.registry());
        } else {
            result.put("url", value.url());
            result.put("commit", value.commit());
            if (!value.path().isEmpty()) result.put("path", value.path());
        }
        return result;
    }

    private static Map<String, String> localized(String value) {
        return Map.of("en", value, "zh", value);
    }
}
