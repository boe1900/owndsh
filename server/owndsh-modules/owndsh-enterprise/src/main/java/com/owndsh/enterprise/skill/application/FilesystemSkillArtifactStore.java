/**
 * [INPUT]: 依赖受控 artifact 根目录和已校验 ZIP 字节。
 * [OUTPUT]: 以 SHA-256 文件名原子保存/读取不可变 skill 制品。
 * [POS]: skill/application 的单机 artifact adapter；与 GitLab Generic Package Registry adapter 共用同一端口。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

public final class FilesystemSkillArtifactStore implements SkillArtifactStore {
    private static final Pattern SHA256 = Pattern.compile("^[0-9a-f]{64}$");
    private final Path root;

    public FilesystemSkillArtifactStore(Path root) {
        this.root = Objects.requireNonNull(root, "root").toAbsolutePath().normalize();
    }

    @Override
    public void putIfAbsent(String sha256, byte[] artifact) {
        validateSha(sha256);
        Objects.requireNonNull(artifact, "artifact");
        if (!sha256.equals(hash(artifact))) throw new IllegalArgumentException("skill artifact SHA-256 不匹配");
        try {
            Files.createDirectories(root);
            Path target = path(sha256);
            if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) {
                verifyExisting(target, artifact);
                return;
            }
            Path temporary = root.resolve("." + sha256 + "." + UUID.randomUUID() + ".tmp");
            try {
                Files.write(temporary, artifact);
                try {
                    Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
                } catch (java.nio.file.AtomicMoveNotSupportedException exception) {
                    moveWithoutReplacing(temporary, target);
                } catch (java.nio.file.FileAlreadyExistsException exception) {
                    verifyExisting(target, artifact);
                }
            } finally {
                Files.deleteIfExists(temporary);
            }
        } catch (IOException exception) {
            throw new SkillArtifactException("skill artifact 保存失败", exception);
        }
    }

    private static void moveWithoutReplacing(Path temporary, Path target) throws IOException {
        try {
            Files.move(temporary, target);
        } catch (java.nio.file.FileAlreadyExistsException exception) {
            // 并发导入同一摘要时，已有文件就是幂等结果；随后仍核对长度。
            verifyExisting(target, Files.readAllBytes(temporary));
        }
    }

    private static void verifyExisting(Path target, byte[] artifact) throws IOException {
        if (!Files.isRegularFile(target, LinkOption.NOFOLLOW_LINKS) || Files.size(target) != artifact.length) {
            throw new SkillArtifactException("skill artifact 已存在但内容不一致");
        }
        try (InputStream existing = Files.newInputStream(target)) {
            byte[] value = existing.readAllBytes();
            if (!java.util.Arrays.equals(value, artifact)) {
                throw new SkillArtifactException("skill artifact 已存在但内容不一致");
            }
        }
    }

    @Override
    public InputStream open(String sha256) throws IOException {
        validateSha(sha256);
        Path target = path(sha256);
        if (!Files.isRegularFile(target, LinkOption.NOFOLLOW_LINKS)) throw new SkillArtifactNotFoundException();
        return Files.newInputStream(target);
    }

    @Override
    public long size(String sha256) throws IOException {
        validateSha(sha256);
        Path target = path(sha256);
        if (!Files.isRegularFile(target, LinkOption.NOFOLLOW_LINKS)) throw new SkillArtifactNotFoundException();
        return Files.size(target);
    }

    private Path path(String sha256) {
        return root.resolve(sha256 + ".zip").normalize();
    }

    private static void validateSha(String value) {
        if (value == null || !SHA256.matcher(value).matches()) throw new IllegalArgumentException("skill SHA-256 非法");
    }

    private static String hash(byte[] value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("JDK 缺少 SHA-256", exception);
        }
    }

    public static class SkillArtifactException extends RuntimeException {
        public SkillArtifactException(String message) {
            super(message);
        }

        public SkillArtifactException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    public static final class SkillArtifactNotFoundException extends IOException {
    }
}
