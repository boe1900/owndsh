/**
 * [INPUT]: 依赖 GitLab Generic Package Registry 的 HTTPS 地址、项目 ID 和部署令牌。
 * [OUTPUT]: 以固定 package 坐标幂等上传、读取和长度查询 skill ZIP，并校验 SHA-256。
 * [POS]: skill/application 的生产 artifact adapter；设备只通过 OwnDsh 代理访问，不接触 GitLab 凭据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Objects;
import java.util.regex.Pattern;

public final class GitLabSkillArtifactStore implements SkillArtifactStore {
    private static final int MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;
    private static final Duration TIMEOUT = Duration.ofSeconds(30);
    private static final Pattern SHA256 = Pattern.compile("^[0-9a-f]{64}$");
    private final HttpClient http;
    private final URI base;
    private final String projectId;
    private final String deployToken;

    public GitLabSkillArtifactStore(URI base, String projectId, String deployToken) {
        this(HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).connectTimeout(TIMEOUT).build(),
            base, projectId, deployToken);
    }

    GitLabSkillArtifactStore(HttpClient http, URI base, String projectId, String deployToken) {
        this.http = Objects.requireNonNull(http, "http");
        this.base = validBase(base);
        if (projectId == null || projectId.isBlank() || projectId.length() > 128) {
            throw new IllegalArgumentException("GitLab artifact projectId 非法");
        }
        if (deployToken == null || deployToken.isBlank()) throw new IllegalArgumentException("GitLab deploy token 不能为空");
        this.projectId = projectId;
        this.deployToken = deployToken;
    }

    @Override
    public void putIfAbsent(String sha256, byte[] artifact) {
        putIfAbsent(sha256, artifact, new ArtifactCoordinate("artifact", "0.0.0", sha256.substring(0, 7)));
    }

    @Override
    public void putIfAbsent(String sha256, byte[] artifact, ArtifactCoordinate coordinate) {
        validateSha(sha256);
        Objects.requireNonNull(artifact, "artifact");
        if (artifact.length > MAX_ARTIFACT_BYTES || !sha256.equals(hash(artifact))) {
            throw new IllegalArgumentException("skill artifact 摘要或大小不匹配");
        }
        URI uri = artifactUri(coordinate.path());
        HttpRequest request = request(uri).header("Content-Type", "application/zip")
            .PUT(HttpRequest.BodyPublishers.ofByteArray(artifact)).build();
        try {
            HttpResponse<Void> response = http.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() / 100 == 2) {
                // GitLab 允许同名 package file 重复发布；上传成功也必须回读核对，保持 release 坐标不可变。
                verifyExisting(uri, sha256, artifact.length);
                return;
            }
            // GitLab CE 在禁止 duplicate file 时返回 400，允许 duplicate 时可能返回 409；两者都回读核对。
            if (response.statusCode() == 400 || response.statusCode() == 409) {
                verifyExisting(uri, sha256, artifact.length);
                return;
            }
            throw failure("GitLab artifact 上传失败: HTTP " + response.statusCode());
        } catch (SkillArtifactException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw failure("GitLab artifact 上传被中断", exception);
        } catch (IOException exception) {
            throw failure("GitLab artifact 上传失败", exception);
        }
    }

    @Override
    public String provider() {
        return "GITLAB_PACKAGE";
    }

    @Override
    public String artifactRef(ArtifactCoordinate coordinate, String sha256) {
        validateSha(sha256);
        return coordinate.path();
    }

    @Override
    public java.io.InputStream open(String sha256) throws IOException {
        return open(sha256, new ArtifactCoordinate("artifact", "0.0.0", sha256.substring(0, 7)).path());
    }

    @Override
    public java.io.InputStream open(String sha256, String artifactRef) throws IOException {
        validateSha(sha256);
        HttpRequest request = request(artifactUri(artifactRef)).GET().build();
        HttpResponse<java.io.InputStream> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IOException("GitLab artifact 下载被中断", exception);
        }
        if (response.statusCode() / 100 != 2) {
            response.body().close();
            throw new IOException("GitLab artifact 下载失败: HTTP " + response.statusCode());
        }
        return new VerifyingInputStream(response.body(), sha256, MAX_ARTIFACT_BYTES);
    }

    @Override
    public long size(String sha256, String artifactRef) throws IOException {
        validateSha(sha256);
        HttpRequest request = request(artifactUri(artifactRef)).method("HEAD", HttpRequest.BodyPublishers.noBody()).build();
        try {
            HttpResponse<Void> response = http.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() / 100 != 2) throw new IOException("GitLab artifact HEAD 失败: HTTP " + response.statusCode());
            long length = response.headers().firstValueAsLong("Content-Length").orElse(-1L);
            if (length <= 0 || length > MAX_ARTIFACT_BYTES) throw new IOException("GitLab artifact 长度无效");
            return length;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IOException("GitLab artifact HEAD 被中断", exception);
        }
    }

    @Override
    public long size(String sha256) throws IOException {
        return size(sha256, new ArtifactCoordinate("artifact", "0.0.0", sha256.substring(0, 7)).path());
    }

    private void verifyExisting(URI uri, String sha256, long expectedLength) {
        try {
            HttpResponse<java.io.InputStream> response = http.send(request(uri).GET().build(),
                HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() / 100 != 2) {
                response.body().close();
                throw failure("GitLab artifact 重复坐标内容不一致");
            }
            try (java.io.InputStream body = response.body()) {
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                byte[] buffer = new byte[8192];
                long total = 0;
                int read;
                while ((read = body.read(buffer)) >= 0) {
                    total += read;
                    if (total > MAX_ARTIFACT_BYTES) throw failure("GitLab artifact 重复坐标超过大小上限");
                    digest.update(buffer, 0, read);
                }
                if (total != expectedLength || !sha256.equals(HexFormat.of().formatHex(digest.digest()))) {
                    throw failure("GitLab artifact 重复坐标内容不一致");
                }
            }
        } catch (NoSuchAlgorithmException exception) {
            throw failure("JDK 缺少 SHA-256", exception);
        } catch (SkillArtifactException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw failure("GitLab artifact 重复坐标核对被中断", exception);
        } catch (IOException exception) {
            throw failure("GitLab artifact 重复坐标核对失败", exception);
        }
    }

    private HttpRequest.Builder request(URI uri) {
        return HttpRequest.newBuilder(uri).timeout(TIMEOUT).header("DEPLOY-TOKEN", deployToken)
            .header("Accept", "application/zip");
    }

    private URI artifactUri(String ref) {
        if (ref == null || ref.isBlank() || ref.startsWith("/") || ref.contains("..") || ref.contains("\\")) {
            throw new IllegalArgumentException("GitLab artifact ref 非法");
        }
        String encodedRef = java.util.Arrays.stream(ref.split("/", -1))
            .map(value -> URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20"))
            .reduce((left, right) -> left + "/" + right).orElseThrow();
        return URI.create(base + "/api/v4/projects/" + URLEncoder.encode(projectId, StandardCharsets.UTF_8)
            + "/packages/generic/" + encodedRef);
    }

    private static URI validBase(URI value) {
        Objects.requireNonNull(value, "base");
        if (!"https".equalsIgnoreCase(value.getScheme()) || value.getUserInfo() != null
            || value.getQuery() != null || value.getFragment() != null || value.getPath() == null) {
            throw new IllegalArgumentException("GitLab artifact base 必须是无凭据 HTTPS URL");
        }
        String text = value.toString();
        return URI.create(text.endsWith("/") ? text.substring(0, text.length() - 1) : text);
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

    private static SkillArtifactException failure(String message) {
        return new SkillArtifactException(message);
    }

    private static SkillArtifactException failure(String message, Throwable cause) {
        return new SkillArtifactException(message, cause);
    }

    private static final class VerifyingInputStream extends java.io.FilterInputStream {
        private final String expected;
        private final java.security.MessageDigest digest;
        private final int max;
        private int total;
        private boolean verified;

        private VerifyingInputStream(java.io.InputStream input, String expected, int max) throws IOException {
            super(input);
            this.expected = expected;
            this.max = max;
            try {
                this.digest = MessageDigest.getInstance("SHA-256");
            } catch (NoSuchAlgorithmException exception) {
                throw new IOException(exception);
            }
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            int read = super.read(buffer, offset, length);
            if (read > 0) {
                total += read;
                if (total > max) throw new IOException("GitLab artifact 超过大小上限");
                digest.update(buffer, offset, read);
            }
            if (read < 0 && !verified) {
                verified = true;
                if (!expected.equals(HexFormat.of().formatHex(digest.digest()))) {
                    throw new IOException("GitLab artifact SHA-256 不匹配");
                }
            }
            return read;
        }

        @Override
        public int read() throws IOException {
            byte[] buffer = new byte[1];
            return read(buffer, 0, 1) < 0 ? -1 : buffer[0] & 0xff;
        }
    }

    public static class SkillArtifactException extends RuntimeException {
        public SkillArtifactException(String message) { super(message); }
        public SkillArtifactException(String message, Throwable cause) { super(message, cause); }
    }
}
