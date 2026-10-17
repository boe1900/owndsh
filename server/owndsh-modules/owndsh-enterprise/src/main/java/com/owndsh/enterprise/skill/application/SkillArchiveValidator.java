/**
 * [INPUT]: 接收 GitLab/GitHub ZIP 归档与可选仓库子路径。
 * [OUTPUT]: 输出规范化的 OwnDsh skill ZIP、WorkBuddy 调用元数据和 SHA-256 摘要。
 * [POS]: skill/application 的供应链信任边界；拒绝路径穿越、超限归档、重复文件和坏 frontmatter。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

public final class SkillArchiveValidator {
    public static final int MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
    public static final int MAX_UNPACKED_BYTES = 64 * 1024 * 1024;
    public static final int MAX_FILE_BYTES = 8 * 1024 * 1024;
    public static final int MAX_FILES = 1_000;

    private static final Pattern NAME = Pattern.compile("^[a-z0-9][a-z0-9._-]*$");
    private static final Pattern VERSION = Pattern.compile(
        "^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$");

    public ValidatedSkill validate(InputStream input, String requestedSubpath) {
        Objects.requireNonNull(input, "input");
        String subpath = normalizeSubpath(requestedSubpath);
        byte[] archive = readLimited(input, MAX_ARCHIVE_BYTES, "skill 归档超过 32 MiB");
        rejectSymlinks(archive);
        Map<String, byte[]> files = readZip(archive);
        String skillFile = findSkillFile(files, subpath);
        String root = skillFile.substring(0, skillFile.length() - "/SKILL.md".length());
        String directoryName = root.substring(root.lastIndexOf('/') + 1);
        if (directoryName.isBlank()) throw invalid("skill 必须位于独立目录");

        Frontmatter metadata = parseFrontmatter(files.get(skillFile));
        if (!NAME.matcher(metadata.name()).matches() || !metadata.name().equals(directoryName)) {
            throw invalid("frontmatter name 必须是 kebab-case 且与目录名一致");
        }
        if (!VERSION.matcher(metadata.version()).matches()) throw invalid("skill version 必须是 semver");

        TreeMap<String, byte[]> canonicalFiles = new TreeMap<>();
        String prefix = root + "/";
        for (Map.Entry<String, byte[]> entry : files.entrySet()) {
            if (entry.getKey().startsWith(prefix)) {
                String relative = entry.getKey().substring(prefix.length());
                if (!relative.isBlank()) canonicalFiles.put(relative, entry.getValue());
            }
        }
        if (!canonicalFiles.containsKey("SKILL.md")) throw invalid("skill 缺少 SKILL.md");
        byte[] normalized = writeCanonicalZip(metadata.name(), canonicalFiles);
        if (normalized.length > MAX_ARCHIVE_BYTES) throw invalid("规范化 skill 归档超过 32 MiB");
        return new ValidatedSkill(metadata.name(), metadata.version(), metadata.description(), metadata.license(),
            metadata.author(), metadata.userInvocable(), metadata.modelInvocable(), metadata.categories(), normalized,
            sha256(normalized));
    }

    private static Map<String, byte[]> readZip(byte[] archive) {
        Map<String, byte[]> files = new HashMap<>();
        long unpacked = 0;
        int count = 0;
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(archive), StandardCharsets.UTF_8)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = safeEntryName(entry.getName());
                if (entry.isDirectory()) continue;
                if (++count > MAX_FILES) throw invalid("skill 文件数超过 1000");
                byte[] value = readLimited(zip, MAX_FILE_BYTES, "skill 单文件超过 8 MiB");
                unpacked += value.length;
                if (unpacked > MAX_UNPACKED_BYTES) throw invalid("skill 解压内容超过 64 MiB");
                if (files.putIfAbsent(name, value) != null) throw invalid("skill 归档包含重复路径");
            }
        } catch (SkillArchiveException exception) {
            throw exception;
        } catch (IOException exception) {
            throw invalid("skill ZIP 归档无效", exception);
        }
        if (files.isEmpty()) throw invalid("skill 归档为空");
        return files;
    }

    private static void rejectSymlinks(byte[] archive) {
        if (archive.length < 22) throw invalid("skill ZIP 缺少 central directory");
        int end = Math.max(0, archive.length - 65_557);
        int eocd = -1;
        for (int i = archive.length - 22; i >= end; i--) {
            if (littleInt(archive, i) == 0x06054b50) {
                eocd = i;
                break;
            }
        }
        if (eocd < 0) throw invalid("skill ZIP 缺少 central directory");
        int eocdCommentLength = littleShort(archive, eocd + 20);
        if (eocd + 22 + eocdCommentLength > archive.length) throw invalid("skill ZIP central directory 无效");
        int centralSize = littleInt(archive, eocd + 12);
        int centralOffset = littleInt(archive, eocd + 16);
        if (centralSize < 0 || centralOffset < 0 || centralOffset > archive.length - centralSize) {
            throw invalid("skill ZIP central directory 无效");
        }
        int cursor = centralOffset;
        int limit = centralOffset + centralSize;
        while (cursor < limit) {
            if (cursor > limit - 46 || littleInt(archive, cursor) != 0x02014b50) {
                throw invalid("skill ZIP central directory 无效");
            }
            int madeBy = littleShort(archive, cursor + 4) >>> 8;
            long attributes = Integer.toUnsignedLong(littleInt(archive, cursor + 38));
            int unixType = (int) ((attributes >>> 16) & 0170000);
            if (madeBy == 3 && unixType == 0120000) throw invalid("skill ZIP 不允许符号链接");
            int nameLength = littleShort(archive, cursor + 28);
            int extraLength = littleShort(archive, cursor + 30);
            int commentLength = littleShort(archive, cursor + 32);
            int next = cursor + 46 + nameLength + extraLength + commentLength;
            if (next <= cursor || next > limit) throw invalid("skill ZIP central directory 无效");
            cursor = next;
        }
    }

    private static int littleShort(byte[] value, int offset) {
        return (value[offset] & 0xff) | ((value[offset + 1] & 0xff) << 8);
    }

    private static int littleInt(byte[] value, int offset) {
        return littleShort(value, offset) | (littleShort(value, offset + 2) << 16);
    }

    private static String findSkillFile(Map<String, byte[]> files, String subpath) {
        String suffix = subpath.isBlank() ? "/SKILL.md" : "/" + subpath + "/SKILL.md";
        List<String> candidates = files.keySet().stream()
            .filter(path -> path.endsWith(suffix))
            .sorted()
            .toList();
        if (candidates.size() != 1) throw invalid("skill 归档必须包含唯一匹配的 SKILL.md");
        return candidates.getFirst();
    }

    private static Frontmatter parseFrontmatter(byte[] skillFile) {
        String text = new String(skillFile, StandardCharsets.UTF_8);
        String[] lines = text.split("\\R", -1);
        int first = 0;
        if (lines.length > 0 && lines[0].startsWith("\uFEFF")) lines[0] = lines[0].substring(1);
        if (lines.length == 0 || !lines[first].trim().equals("---")) throw invalid("SKILL.md frontmatter 缺失");
        int end = -1;
        for (int i = first + 1; i < lines.length; i++) {
            if (lines[i].trim().equals("---")) {
                end = i;
                break;
            }
        }
        if (end < 0) throw invalid("SKILL.md frontmatter 未闭合");
        Map<String, String> fields = new HashMap<>();
        for (int i = first + 1; i < end; i++) {
            String line = lines[i].trim();
            if (line.isBlank() || line.startsWith("#")) continue;
            int colon = line.indexOf(':');
            if (colon <= 0) throw invalid("SKILL.md frontmatter 行无效");
            String key = line.substring(0, colon).trim();
            String value = unquote(line.substring(colon + 1).trim());
            if (fields.putIfAbsent(key, value) != null) throw invalid("SKILL.md frontmatter 字段重复: " + key);
        }
        String name = required(fields, "name");
        String version = required(fields, "version");
        String description = required(fields, "description");
        String author = required(fields, "author");
        String license = fields.getOrDefault("license", "");
        boolean userInvocable = booleanField(fields, "user-invocable", true);
        boolean modelInvocable = !booleanField(fields, "disable-model-invocation", false);
        List<String> categories = categories(fields);
        return new Frontmatter(name, version, description, license, author, userInvocable, modelInvocable, categories);
    }

    private static List<String> categories(Map<String, String> fields) {
        String value = fields.get("categories");
        if (value == null) value = fields.get("category");
        if (value == null || value.isBlank()) return List.of();
        String body = value.startsWith("[") && value.endsWith("]")
            ? value.substring(1, value.length() - 1) : value;
        List<String> values = new ArrayList<>();
        for (String item : body.split(",")) {
            String category = unquote(item.trim());
            if (!category.isBlank() && !values.contains(category)) values.add(category);
        }
        if (values.size() > 12 || values.stream().anyMatch(item -> item.length() > 40)) {
            throw invalid("skill categories 非法");
        }
        return List.copyOf(values);
    }

    private static boolean booleanField(Map<String, String> fields, String key, boolean defaultValue) {
        String value = fields.get(key);
        if (value == null) return defaultValue;
        if ("true".equalsIgnoreCase(value)) return true;
        if ("false".equalsIgnoreCase(value)) return false;
        throw invalid("skill frontmatter 布尔字段非法: " + key);
    }

    private static String required(Map<String, String> fields, String key) {
        String value = fields.get(key);
        if (value == null || value.isBlank() || value.length() > 2000) throw invalid("skill frontmatter 缺少 " + key);
        return value;
    }

    private static byte[] writeCanonicalZip(String name, Map<String, byte[]> files) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (ZipOutputStream zip = new ZipOutputStream(output, StandardCharsets.UTF_8)) {
                files.entrySet().stream().sorted(Comparator.comparing(Map.Entry::getKey)).forEach(entry -> {
                    try {
                        ZipEntry target = new ZipEntry(name + "/" + entry.getKey());
                        target.setTime(0L);
                        zip.putNextEntry(target);
                        zip.write(entry.getValue());
                        zip.closeEntry();
                    } catch (IOException exception) {
                        throw new SkillArchiveException("skill 归档写入失败", exception);
                    }
                });
            }
            return output.toByteArray();
        } catch (SkillArchiveException exception) {
            throw exception;
        } catch (IOException exception) {
            throw invalid("skill 归档写入失败", exception);
        }
    }

    private static String safeEntryName(String value) {
        if (value == null || value.isBlank() || value.startsWith("/") || value.indexOf('\\') >= 0) {
            throw invalid("skill 归档路径非法");
        }
        String normalized = value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
        for (String part : normalized.split("/")) {
            if (part.isBlank() || ".".equals(part) || "..".equals(part)) throw invalid("skill 归档路径穿越");
        }
        return normalized;
    }

    private static String normalizeSubpath(String value) {
        if (value == null || value.isBlank()) return "";
        String normalized = value.trim().replace('/', '/');
        safeEntryName(normalized);
        return normalized;
    }

    private static String unquote(String value) {
        if (value.length() >= 2 && ((value.startsWith("\"") && value.endsWith("\""))
            || (value.startsWith("'") && value.endsWith("'")))) {
            return value.substring(1, value.length() - 1);
        }
        return value;
    }

    private static byte[] readLimited(InputStream input, int max, String message) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream(Math.min(max, 8192));
            byte[] buffer = new byte[8192];
            int read;
            int total = 0;
            while ((read = input.read(buffer)) >= 0) {
                if (read == 0) continue;
                total += read;
                if (total > max) throw invalid(message);
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        } catch (SkillArchiveException exception) {
            throw exception;
        } catch (IOException exception) {
            throw invalid("skill 归档读取失败", exception);
        }
    }

    private static String sha256(byte[] value) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("JDK 缺少 SHA-256", exception);
        }
    }

    private static SkillArchiveException invalid(String message) {
        return new SkillArchiveException(message);
    }

    private static SkillArchiveException invalid(String message, Throwable cause) {
        return new SkillArchiveException(message, cause);
    }

    private record Frontmatter(String name, String version, String description, String license, String author,
        boolean userInvocable, boolean modelInvocable, List<String> categories) {
    }

    public record ValidatedSkill(String name, String version, String description, String license, String author,
        boolean userInvocable, boolean modelInvocable, List<String> categories, byte[] archive, String sha256) {
        public ValidatedSkill {
            categories = List.copyOf(categories);
            archive = archive.clone();
        }

        @Override
        public byte[] archive() {
            return archive.clone();
        }
    }

    public static final class SkillArchiveException extends RuntimeException {
        public SkillArchiveException(String message) {
            super(message);
        }

        public SkillArchiveException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
