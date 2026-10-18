/**
 * [INPUT]: 接收管理端登记的 DSH market format 1 插件级展示资料。
 * [OUTPUT]: 提供经过边界校验的标题、作者、仓库、分类、标签和排序值。
 * [POS]: plugin/domain 的包级市场元数据；版本只保存安装来源与运行时兼容性。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.domain;

import java.net.URI;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public record PluginMarketMetadata(
    String title,
    String description,
    String icon,
    String author,
    String homepage,
    String repositoryUrl,
    String repositoryDirectory,
    String category,
    List<String> keywords,
    List<String> labels,
    Map<String, Double> sortKeys
) {
    private static final Pattern DATA_ICON = Pattern.compile(
        "^data:(?:image/svg\\+xml|image/png|image/jpeg|image/webp);base64,([A-Za-z0-9+/]*={0,2})$"
    );

    public PluginMarketMetadata {
        title = text(title, "title", 120, true);
        description = text(description, "description", 2000, true);
        icon = icon(icon);
        author = text(author, "author", 120, true);
        homepage = homepage(homepage);
        repositoryUrl = url(repositoryUrl, "repositoryUrl");
        repositoryDirectory = path(repositoryDirectory, "repositoryDirectory");
        category = text(category, "category", 40, true);
        keywords = values(keywords, "keywords", 100, 80);
        labels = values(labels, "labels", 100, 80);
        sortKeys = Map.copyOf(Objects.requireNonNullElse(sortKeys, Map.of()));
        if (sortKeys.size() > 50 || sortKeys.entrySet().stream().anyMatch(entry ->
            entry.getKey() == null || entry.getKey().isBlank() || entry.getKey().length() > 80
                || entry.getValue() == null || !Double.isFinite(entry.getValue()))) {
            throw new IllegalArgumentException("sortKeys 非法");
        }
    }

    public static PluginMarketMetadata from(PluginInstallation installation) {
        return new PluginMarketMetadata(
            installation.displayName(), installation.description(), "", installation.author(), "",
            installation.repositoryUrl(), "", installation.category(), List.of(), List.of(), Map.of()
        );
    }

    private static String text(String value, String name, int max, boolean allowEmpty) {
        value = Objects.requireNonNullElse(value, "").trim();
        if (value.length() > max || value.chars().anyMatch(Character::isISOControl)
            || (!allowEmpty && value.isBlank())) throw new IllegalArgumentException(name + " 非法");
        return value;
    }

    private static String url(String value, String name) {
        value = text(value, name, 4096, true);
        if (value.isEmpty()) return value;
        URI uri = URI.create(value);
        if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))
            || uri.getHost() == null || uri.getRawUserInfo() != null
            || uri.getRawQuery() != null || uri.getRawFragment() != null) {
            throw new IllegalArgumentException(name + " 必须是无凭据、无查询参数和片段的 HTTP(S) URL");
        }
        return value;
    }

    private static String homepage(String value) {
        value = text(value, "homepage", 4096, true);
        if (value.isEmpty()) return value;
        URI uri = URI.create(value);
        if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())) || uri.getHost() == null
            || uri.getRawUserInfo() != null) throw new IllegalArgumentException("homepage 必须是 HTTP(S) URL");
        return value;
    }

    private static String icon(String value) {
        value = text(value, "icon", 4096, true);
        if (value.isEmpty()) return value;
        Matcher data = DATA_ICON.matcher(value);
        if (data.matches()) {
            if (data.group(1).isEmpty() || Base64.getDecoder().decode(data.group(1)).length > 32 * 1024) {
                throw new IllegalArgumentException("icon data URL 过大");
            }
            return value;
        }
        if (value.startsWith("data:")) throw new IllegalArgumentException("icon data URL 非法");
        try {
            URI uri = URI.create(value);
            if (uri.getScheme() == null) {
                if (value.startsWith("//") || value.startsWith("\\")) throw new IllegalArgumentException("icon URL 非法");
                return value;
            }
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null) {
                throw new IllegalArgumentException("icon 必须是 HTTPS 或相对 URL");
            }
            return value;
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("icon URL 非法", exception);
        }
    }

    private static String path(String value, String name) {
        value = text(value, name, 256, true);
        if (value.isEmpty()) return value;
        if (value.startsWith("/") || value.contains("\\")
            || java.util.Arrays.stream(value.split("/"))
                .anyMatch(segment -> segment.isBlank() || segment.equals(".") || segment.equals("..")
                    || !segment.matches("[A-Za-z0-9._@+-]+"))) {
            throw new IllegalArgumentException(name + " 必须是相对 POSIX 路径");
        }
        return value;
    }

    private static List<String> values(List<String> values, String name, int maxItems, int maxLength) {
        List<String> result = List.copyOf(Objects.requireNonNullElse(values, List.of())).stream()
            .map(value -> text(value, name, maxLength, false)).distinct().toList();
        if (result.size() > maxItems) throw new IllegalArgumentException(name + " 数量超限");
        return result;
    }
}
