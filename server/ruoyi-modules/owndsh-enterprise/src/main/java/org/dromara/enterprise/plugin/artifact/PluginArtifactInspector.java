/**
 * [INPUT]: 依赖 Commons Compress、Jackson 3 与解压/entry 上限，读取不可信 pnpm pack tgz。
 * [OUTPUT]: 对外提供已验证 package name/version/displayName 和 bundle patch 的归档摘要。
 * [POS]: plugin/artifact 的单遍验包闸门，绝不把未知 entry 解压到文件系统。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.plugin.artifact;

import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

public final class PluginArtifactInspector {
    private static final int MAX_PACKAGE_JSON_BYTES = 1_048_576;
    private static final Set<String> FORBIDDEN_SCRIPTS = Set.of("preinstall", "install", "postinstall", "prepare");
    private static final Set<String> PROTECTED_PACKAGES = Set.of(
        "owndsh-plugin",
        "@owndsh/platform-client",
        "@owndsh/plugin-distribution"
    );
    private static final Pattern PACKAGE_NAME = Pattern.compile(
        "^(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*$"
    );
    private static final Pattern SEMVER = Pattern.compile(
        "^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$"
    );
    private static final Pattern EXACT_VERSION = Pattern.compile(
        "^(?:[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?|[0-9]+(?:\\.[0-9]+){0,2}-rc\\.[0-9]+)$"
    );

    private final JsonMapper json;
    private final long maxExpandedBytes;
    private final int maxEntries;

    public PluginArtifactInspector(JsonMapper json, long maxExpandedBytes, int maxEntries) {
        this.json = Objects.requireNonNull(json, "json");
        if (maxExpandedBytes <= 0 || maxEntries <= 0) throw new IllegalArgumentException("归档上限必须为正数");
        this.maxExpandedBytes = maxExpandedBytes;
        this.maxEntries = maxEntries;
    }

    public InspectedPlugin inspect(Path archive) {
        Objects.requireNonNull(archive, "archive");
        Set<String> paths = new HashSet<>();
        byte[] packageJson = null;
        long expanded = 0;
        int entries = 0;
        try (InputStream file = Files.newInputStream(archive);
             GzipCompressorInputStream gzip = GzipCompressorInputStream.builder().setInputStream(file).get();
             TarArchiveInputStream tar = new TarArchiveInputStream(gzip)) {
            TarArchiveEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = tar.getNextEntry()) != null) {
                if (++entries > maxEntries) throw tooLarge("归档 entry 数超过上限");
                String name = validateEntry(entry);
                if (!paths.add(name)) throw invalid("归档包含重复路径");
                if (!tar.canReadEntryData(entry)) throw invalid("归档包含不支持的 entry");
                if (entry.getSize() > maxExpandedBytes - expanded) throw tooLarge("归档解压大小超过上限");

                ByteArrayOutputStream capture = "package/package.json".equals(name)
                    ? new ByteArrayOutputStream(Math.min(MAX_PACKAGE_JSON_BYTES, (int) Math.max(0, entry.getSize())))
                    : null;
                int read;
                while ((read = tar.read(buffer)) != -1) {
                    expanded = Math.addExact(expanded, read);
                    if (expanded > maxExpandedBytes) throw tooLarge("归档解压大小超过上限");
                    if (capture != null) {
                        if (capture.size() + read > MAX_PACKAGE_JSON_BYTES) {
                            throw invalid("package.json 过大");
                        }
                        capture.write(buffer, 0, read);
                    }
                }
                if (capture != null) packageJson = capture.toByteArray();
            }
        } catch (PluginArtifactException exception) {
            throw exception;
        } catch (ArithmeticException exception) {
            throw tooLarge("归档解压大小溢出");
        } catch (IOException | RuntimeException exception) {
            throw invalid("tgz 归档无法解析", exception);
        }
        if (entries == 0 || packageJson == null) throw invalid("归档缺少 package/package.json");
        return validatePackageJson(packageJson, paths);
    }

    private static String validateEntry(TarArchiveEntry entry) {
        String name = entry.getName();
        if (name == null || name.isEmpty() || name.indexOf('\0') >= 0 || name.indexOf('\\') >= 0
            || name.startsWith("/") || !name.startsWith("package/")) {
            throw invalid("归档路径非法");
        }
        String[] segments = name.split("/", -1);
        if (segments.length < 2 || !"package".equals(segments[0])) throw invalid("归档路径不在 package/ 下");
        for (int index = 1; index < segments.length; index++) {
            if ("..".equals(segments[index]) || ".".equals(segments[index])
                || (segments[index].isEmpty() && index != segments.length - 1)) {
                throw invalid("归档路径包含逃逸段");
            }
        }
        if (entry.isSymbolicLink() || entry.isLink() || entry.isCharacterDevice()
            || entry.isBlockDevice() || entry.isFIFO() || (!entry.isFile() && !entry.isDirectory())) {
            throw invalid("归档包含链接或特殊文件");
        }
        if (entry.isFile() && name.toLowerCase(Locale.ROOT).endsWith(".node")) {
            throw invalid("归档包含原生 .node 模块");
        }
        return name;
    }

    private InspectedPlugin validatePackageJson(byte[] bytes, Set<String> paths) {
        JsonNode root;
        try {
            root = json.readTree(bytes);
        } catch (RuntimeException exception) {
            throw invalid("package.json 不是有效 JSON", exception);
        }
        if (root == null || !root.isObject()) throw invalid("package.json 必须是 object");
        String name = requiredText(root.get("name"), "name", 214);
        if (!PACKAGE_NAME.matcher(name).matches()) throw invalid("package name 非法");
        if (PROTECTED_PACKAGES.contains(name)) throw invalid("企业核心包不能通过通用插件分发");
        String version = requiredText(root.get("version"), "version", 64);
        if (!SEMVER.matcher(version).matches()) throw invalid("package version 必须是 SemVer");
        if (!"module".equals(requiredText(root.get("type"), "type", 16))) {
            throw invalid("package type 必须为 module");
        }
        validateScripts(root.get("scripts"));
        validateDependencies(root.get("dependencies"), false);
        validateDependencies(root.get("peerDependencies"), true);

        JsonNode dsh = root.get("dsh");
        JsonNode bundle = dsh == null ? null : dsh.get("bundle");
        String patch = requiredText(bundle == null ? null : bundle.get("patch"), "dsh.bundle.patch", 240);
        String normalizedPatch = normalizePatch(patch);
        if (!paths.contains("package/" + normalizedPatch)) throw invalid("bundle patch 文件不存在");
        String displayName = optionalText(root.get("displayName"), 120);
        return new InspectedPlugin(name, version, displayName == null ? name : displayName, normalizedPatch);
    }

    private static void validateScripts(JsonNode scripts) {
        if (scripts == null) return;
        if (!scripts.isObject()) throw invalid("scripts 必须是 object");
        for (String script : FORBIDDEN_SCRIPTS) {
            if (scripts.get(script) != null) throw invalid("package 包含 install lifecycle script");
        }
    }

    private static void validateDependencies(JsonNode dependencies, boolean peers) {
        if (dependencies == null) return;
        if (!dependencies.isObject()) throw invalid((peers ? "peerDependencies" : "dependencies") + " 必须是 object");
        if (!peers && !dependencies.isEmpty()) throw invalid("dependencies 必须为空");
        if (!peers) return;
        for (String dependency : dependencies.propertyNames()) {
            JsonNode version = dependencies.get(dependency);
            if (dependency.startsWith("@deepseek-ai/")
                && (version == null || !version.isString() || !EXACT_VERSION.matcher(version.stringValue()).matches())) {
                throw invalid("Harness peerDependency 必须使用精确版本");
            }
        }
    }

    private static String normalizePatch(String patch) {
        String value = patch.startsWith("./") ? patch.substring(2) : patch;
        if (value.isEmpty() || value.startsWith("/") || value.indexOf('\\') >= 0 || value.indexOf('\0') >= 0) {
            throw invalid("bundle patch 路径非法");
        }
        for (String segment : value.split("/", -1)) {
            if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)) {
                throw invalid("bundle patch 路径非法");
            }
        }
        return value;
    }

    private static String requiredText(JsonNode value, String name, int maxLength) {
        String text = optionalText(value, maxLength);
        if (text == null) throw invalid("package.json 缺少 " + name);
        return text;
    }

    private static String optionalText(JsonNode value, int maxLength) {
        if (value == null) return null;
        if (!value.isString() || value.stringValue().isBlank() || value.stringValue().length() > maxLength
            || value.stringValue().indexOf('\0') >= 0) {
            throw invalid("package.json 文本字段非法");
        }
        return value.stringValue();
    }

    private static PluginArtifactException invalid(String message) {
        return new PluginArtifactException(PluginArtifactException.Kind.INVALID, message);
    }

    private static PluginArtifactException invalid(String message, Throwable cause) {
        return new PluginArtifactException(PluginArtifactException.Kind.INVALID, message, cause);
    }

    private static PluginArtifactException tooLarge(String message) {
        return new PluginArtifactException(PluginArtifactException.Kind.TOO_LARGE, message);
    }

    public record InspectedPlugin(String packageName, String version, String displayName, String patchPath) {
    }
}
