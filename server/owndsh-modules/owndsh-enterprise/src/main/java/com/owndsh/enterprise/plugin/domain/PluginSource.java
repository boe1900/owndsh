/**
 * [INPUT]: 接收 DSH plugin market 的 npm 或 Git 精确来源。
 * [OUTPUT]: 提供可验证的安装来源及 pnpm 精确安装 spec。
 * [POS]: plugin/domain 的版本级来源事实，市场索引直接投影它。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.net.URI;
import java.util.Objects;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record PluginSource(String type, String registry, String url, String commit, String path) {
    public PluginSource {
        type = Objects.requireNonNull(type, "type");
        if (!type.equals("npm") && !type.equals("git")) throw new IllegalArgumentException("source.type 非法");
        registry = text(registry, "registry", 4096);
        url = text(url, "url", 4096);
        commit = text(commit, "commit", 40);
        path = text(path, "path", 256);
        if (type.equals("npm")) {
            if (!url.isEmpty() || !commit.isEmpty() || !path.isEmpty()) throw new IllegalArgumentException("npm source 字段非法");
            if (!registry.isEmpty()) httpUrl(registry, false);
        } else {
            if (!registry.isEmpty() || !commit.matches("[0-9a-f]{40}")) throw new IllegalArgumentException("git source 字段非法");
            httpUrl(url, true);
            URI repository = URI.create(url);
            if (repository.getPath() == null || repository.getPath().split("/").length < 3
                || repository.getPath().matches(".*\\.(?i:tgz|tar\\.gz)$")) {
                throw new IllegalArgumentException("git url 必须指向仓库");
            }
            if (path.startsWith("/") || path.contains("\\")
                || java.util.Arrays.stream(path.split("/"))
                    .anyMatch(segment -> segment.isBlank() || segment.equals(".") || segment.equals("..")
                        || !segment.matches("[A-Za-z0-9._@+-]+"))) {
                throw new IllegalArgumentException("git path 非法");
            }
        }
    }

    public static PluginSource npm(String registry) {
        return new PluginSource("npm", registry, "", "", "");
    }

    public static PluginSource git(String url, String commit, String path) {
        return new PluginSource("git", "", url, commit, path);
    }

    public String spec(String packageName, String version) {
        if (type.equals("npm")) return packageName + "@" + version;
        String repository = url.endsWith(".git") ? url : url + ".git";
        return "git+" + repository + "#" + commit + (path.isEmpty() ? "" : "&path:/" + path);
    }

    private static String text(String value, String name, int max) {
        value = Objects.requireNonNullElse(value, "").trim();
        if (value.length() > max || value.chars().anyMatch(Character::isISOControl)) throw new IllegalArgumentException(name + " 非法");
        return value;
    }

    private static void httpUrl(String value, boolean httpsOnly) {
        URI uri = URI.create(value);
        if (!("https".equals(uri.getScheme()) || (!httpsOnly && "http".equals(uri.getScheme())))
            || uri.getHost() == null || uri.getRawUserInfo() != null
            || uri.getRawQuery() != null || uri.getRawFragment() != null) {
            throw new IllegalArgumentException("Git 来源必须是无凭据、无查询参数和片段的 HTTPS URL");
        }
    }
}
