/**
 * [INPUT]: 依赖受控 artifact root、压缩大小上限、不可信上传流与本机文件锁语义。
 * [OUTPUT]: 提供 `.part` 有界写入/SHA-256、跨进程 hash 互斥、原子 CAS 终结、解析和清理能力。
 * [POS]: plugin/artifact 的唯一文件系统边界，串行化同 hash 的事务补偿且不接受请求路径。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.plugin.artifact;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.locks.ReentrantLock;

public final class PluginArtifactStore {
    private final Path root;
    private final Path temporaryRoot;
    private final Path lockRoot;
    private final long maxArchiveBytes;
    private final ReentrantLock[] processLocks = new ReentrantLock[64];

    public PluginArtifactStore(Path root, long maxArchiveBytes) {
        Objects.requireNonNull(root, "root");
        if (maxArchiveBytes <= 0) throw new IllegalArgumentException("maxArchiveBytes 必须为正数");
        this.root = root.toAbsolutePath().normalize();
        this.temporaryRoot = this.root.resolve("tmp");
        this.lockRoot = this.root.resolve("locks");
        this.maxArchiveBytes = maxArchiveBytes;
        for (int index = 0; index < processLocks.length; index++) processLocks[index] = new ReentrantLock();
        try {
            Files.createDirectories(temporaryRoot);
            Files.createDirectories(lockRoot);
            Files.createDirectories(this.root.resolve("sha256"));
        } catch (IOException exception) {
            throw new IllegalStateException("插件 artifact root 无法初始化", exception);
        }
    }

    public PendingArtifact writePending(UUID uploadId, InputStream input) {
        Objects.requireNonNull(uploadId, "uploadId");
        Objects.requireNonNull(input, "input");
        Path path = temporaryRoot.resolve(uploadId + ".part");
        MessageDigest digest = sha256Digest();
        long size = 0;
        try (OutputStream output = Files.newOutputStream(path, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                size = Math.addExact(size, read);
                if (size > maxArchiveBytes) {
                    throw new PluginArtifactException(
                        PluginArtifactException.Kind.TOO_LARGE, "插件 tgz 压缩大小超过上限"
                    );
                }
                digest.update(buffer, 0, read);
                output.write(buffer, 0, read);
            }
        } catch (PluginArtifactException exception) {
            deleteQuietly(path);
            throw exception;
        } catch (ArithmeticException exception) {
            deleteQuietly(path);
            throw new PluginArtifactException(
                PluginArtifactException.Kind.TOO_LARGE, "插件 tgz 压缩大小溢出", exception
            );
        } catch (IOException exception) {
            deleteQuietly(path);
            throw new IllegalStateException("插件上传临时文件写入失败", exception);
        }
        if (size == 0) {
            deleteQuietly(path);
            throw new PluginArtifactException(PluginArtifactException.Kind.INVALID, "插件 tgz 不能为空");
        }
        return new PendingArtifact(path, size, HexFormat.of().formatHex(digest.digest()));
    }

    public ArtifactMutationLock lockForMutation(PendingArtifact pending) {
        Objects.requireNonNull(pending, "pending");
        String sha256 = pending.sha256();
        referenceFor(sha256);
        ReentrantLock processLock = processLocks[(sha256.hashCode() & Integer.MAX_VALUE) % processLocks.length];
        processLock.lock();
        FileChannel channel = null;
        try {
            Path lockPath = lockRoot.resolve(sha256 + ".lock");
            channel = FileChannel.open(lockPath, StandardOpenOption.CREATE, StandardOpenOption.WRITE);
            FileLock fileLock = channel.lock();
            return new ArtifactMutationLock(processLock, channel, fileLock);
        } catch (IOException | RuntimeException exception) {
            closeQuietly(channel);
            processLock.unlock();
            throw new IllegalStateException("插件制品 hash 锁获取失败", exception);
        }
    }

    public StoredArtifact finalizeArtifact(PendingArtifact pending) {
        Objects.requireNonNull(pending, "pending");
        Path target = pathFor(pending.sha256());
        try {
            Files.createDirectories(target.getParent());
            if (Files.exists(target)) {
                verifyExisting(target, pending);
                Files.deleteIfExists(pending.path());
                return new StoredArtifact(target, referenceFor(pending.sha256()), pending.sizeBytes(), pending.sha256(), false);
            }
            try {
                Files.move(pending.path(), target, StandardCopyOption.ATOMIC_MOVE);
            } catch (FileAlreadyExistsException exception) {
                verifyExisting(target, pending);
                Files.deleteIfExists(pending.path());
                return new StoredArtifact(target, referenceFor(pending.sha256()), pending.sizeBytes(), pending.sha256(), false);
            } catch (AtomicMoveNotSupportedException exception) {
                throw new IllegalStateException("artifact root 不支持同文件系统原子移动", exception);
            }
            return new StoredArtifact(target, referenceFor(pending.sha256()), pending.sizeBytes(), pending.sha256(), true);
        } catch (IOException exception) {
            throw new IllegalStateException("插件制品原子终结失败", exception);
        }
    }

    public Path resolve(String artifactRef, String sha256) {
        String expected = referenceFor(sha256);
        if (!expected.equals(artifactRef)) throw new IllegalStateException("插件 artifact 引用与 SHA-256 不一致");
        Path path = root.resolve(artifactRef).normalize();
        if (!path.startsWith(root) || !Files.isRegularFile(path)) {
            throw new IllegalStateException("插件 artifact 不存在");
        }
        return path;
    }

    public void deletePending(PendingArtifact pending) {
        if (pending != null) deleteQuietly(pending.path());
    }

    public void deleteStoredIfCreated(StoredArtifact stored) {
        if (stored != null && stored.created()) deleteQuietly(stored.path());
    }

    private Path pathFor(String sha256) {
        return root.resolve(referenceFor(sha256));
    }

    private static String referenceFor(String sha256) {
        if (sha256 == null || !sha256.matches("^[0-9a-f]{64}$")) throw new IllegalArgumentException("SHA-256 非法");
        return "sha256/" + sha256.substring(0, 2) + "/" + sha256 + ".tgz";
    }

    private static void verifyExisting(Path target, PendingArtifact pending) throws IOException {
        if (Files.size(target) != pending.sizeBytes()) throw new IllegalStateException("CAS 制品大小冲突");
        MessageDigest digest = sha256Digest();
        try (InputStream input = Files.newInputStream(target)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        if (!pending.sha256().equals(HexFormat.of().formatHex(digest.digest()))) {
            throw new IllegalStateException("CAS 制品 hash 冲突");
        }
    }

    private static MessageDigest sha256Digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("JVM 缺少 SHA-256", exception);
        }
    }

    private static void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // 清理失败由运维临时目录清理处理，不能覆盖原始业务异常。
        }
    }

    private static void closeQuietly(FileChannel channel) {
        if (channel == null) return;
        try {
            channel.close();
        } catch (IOException ignored) {
            // 获取锁失败时只保留原始异常。
        }
    }

    public record PendingArtifact(Path path, long sizeBytes, String sha256) {
    }

    public record StoredArtifact(Path path, String artifactRef, long sizeBytes, String sha256, boolean created) {
    }

    public static final class ArtifactMutationLock implements AutoCloseable {
        private final ReentrantLock processLock;
        private final FileChannel channel;
        private final FileLock fileLock;
        private boolean closed;

        private ArtifactMutationLock(ReentrantLock processLock, FileChannel channel, FileLock fileLock) {
            this.processLock = processLock;
            this.channel = channel;
            this.fileLock = fileLock;
        }

        @Override
        public void close() {
            if (closed) return;
            closed = true;
            try {
                try {
                    fileLock.close();
                } finally {
                    channel.close();
                }
            } catch (IOException exception) {
                throw new IllegalStateException("插件制品 hash 锁释放失败", exception);
            } finally {
                processLock.unlock();
            }
        }
    }
}
