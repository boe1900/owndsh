/**
 * [INPUT]: 依赖 JDK HttpClient、GitLab/GitHub commit API、archive endpoint 和一次性 token。
 * [OUTPUT]: 将 branch/tag/ref 固定解析为 commit，并下载受限源码 ZIP。
 * [POS]: skill/application 的默认源码 adapter；token 只进入请求 header，不进入 URL。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Objects;

public final class HttpSkillSourceClient implements SkillSourceClient {
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(20);
    private final HttpClient http;
    private final JsonMapper json;

    public HttpSkillSourceClient(JsonMapper json) {
        this(HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(REQUEST_TIMEOUT).build(), json);
    }

    HttpSkillSourceClient(HttpClient http, JsonMapper json) {
        this.http = Objects.requireNonNull(http, "http");
        this.json = Objects.requireNonNull(json, "json");
    }

    @Override
    public FetchedArchive fetch(Source source) {
        return fetch(source, null);
    }

    @Override
    public FetchedArchive fetch(Source source, char[] credential) {
        Repository repository = Repository.parse(source.repositoryUrl());
        String commit = resolveCommit(repository, source.revision(), credential);
        byte[] archive = download(repository.archiveUrl(commit), repository, credential);
        return new FetchedArchive(commit, archive);
    }

    private String resolveCommit(Repository repository, String revision, char[] credential) {
        URI url = repository.commitApiUrl(revision);
        JsonNode body = readJson(url, repository, credential);
        JsonNode value = repository.github() ? body.path("sha") : body.isArray() && !body.isEmpty()
            ? body.get(0).path("id") : body.path("id");
        String commit = value.asString("");
        if (!commit.matches("^[0-9a-fA-F]{7,64}$")) throw sourceFailure(Kind.UPSTREAM_INVALID, "源码 ref 未解析为 commit");
        return commit.toLowerCase();
    }

    private byte[] download(URI uri, Repository repository, char[] credential) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri).timeout(REQUEST_TIMEOUT)
            .header("Accept", "application/zip").header("User-Agent", "OwnDsh-Skill-Importer/1");
        addCredential(builder, repository, credential);
        HttpRequest request = builder.GET().build();
        try {
            HttpResponse<InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() / 100 != 2) {
                response.body().close();
                throw sourceFailure(responseKind(response.statusCode()), "源码归档下载失败: HTTP " + response.statusCode());
            }
            return readLimited(response.body(), SkillArchiveValidator.MAX_ARCHIVE_BYTES);
        } catch (SkillSourceException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw sourceFailure(Kind.UPSTREAM_UNAVAILABLE, "源码归档下载被中断", exception);
        } catch (IOException exception) {
            throw sourceFailure(Kind.UPSTREAM_UNAVAILABLE, "源码归档下载失败", exception);
        }
    }

    private JsonNode readJson(URI uri, Repository repository, char[] credential) {
        byte[] body = downloadJson(uri, repository, credential);
        try {
            return json.readTree(body);
        } catch (RuntimeException exception) {
            throw sourceFailure(Kind.UPSTREAM_INVALID, "源码 commit API 返回 JSON 无效", exception);
        }
    }

    private byte[] downloadJson(URI uri, Repository repository, char[] credential) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri).timeout(REQUEST_TIMEOUT)
            .header("Accept", "application/json").header("User-Agent", "OwnDsh-Skill-Importer/1");
        addCredential(builder, repository, credential);
        HttpRequest request = builder.GET().build();
        try {
            HttpResponse<InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() / 100 != 2) {
                response.body().close();
                throw sourceFailure(responseKind(response.statusCode()), "源码 commit API 失败: HTTP " + response.statusCode());
            }
            return readLimited(response.body(), 512 * 1024);
        } catch (SkillSourceException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw sourceFailure(Kind.UPSTREAM_UNAVAILABLE, "源码 commit API 请求被中断", exception);
        } catch (IOException exception) {
            throw sourceFailure(Kind.UPSTREAM_UNAVAILABLE, "源码 commit API 请求失败", exception);
        }
    }

    private static void addCredential(HttpRequest.Builder builder, Repository repository, char[] credential) {
        if (credential == null || credential.length == 0) return;
        String value = new String(credential);
        if (repository.github()) builder.header("Authorization", "Bearer " + value);
        else builder.header("PRIVATE-TOKEN", value);
    }

    private static byte[] readLimited(InputStream input, int max) throws IOException {
        try (input) {
            byte[] buffer = new byte[8192];
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            int total = 0;
            int read;
            while ((read = input.read(buffer)) >= 0) {
                if (read == 0) continue;
                total += read;
                if (total > max) throw sourceFailure(Kind.UPSTREAM_INVALID, "源码响应超过大小上限");
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private static URI uri(String value) {
        URI uri;
        try {
            uri = URI.create(value);
        } catch (IllegalArgumentException exception) {
            throw sourceFailure(Kind.INVALID_REQUEST, "源码地址无效", exception);
        }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null
            || uri.getQuery() != null || uri.getFragment() != null || uri.getPath() == null) {
            throw sourceFailure(Kind.INVALID_REQUEST, "源码地址必须是无凭据 HTTPS URL");
        }
        return uri;
    }

    private static String encoded(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static SkillSourceException sourceFailure(Kind kind, String message) {
        return new SkillSourceException(kind, message);
    }

    private static SkillSourceException sourceFailure(Kind kind, String message, Throwable cause) {
        return new SkillSourceException(kind, message, cause);
    }

    private static Kind responseKind(int status) {
        if (status == 401 || status == 403) return Kind.AUTH_FAILED;
        return status == 429 || status >= 500 ? Kind.UPSTREAM_UNAVAILABLE : Kind.INVALID_REQUEST;
    }

    private record Repository(URI base, String project, boolean github) {
        static Repository parse(String value) {
            URI uri = uri(value);
            String host = uri.getHost();
            List<String> parts = List.of(uri.getPath().replaceFirst("^/", "").split("/"));
            if ("github.com".equalsIgnoreCase(host)) {
                if (parts.size() != 2 || parts.stream().anyMatch(String::isBlank)) {
                    throw sourceFailure(Kind.INVALID_REQUEST, "GitHub 地址必须是 /owner/repository");
                }
                return new Repository(URI.create("https://api.github.com"),
                    parts.get(0) + "/" + stripGit(parts.get(1)), true);
            }
            if (parts.size() < 2 || parts.stream().anyMatch(String::isBlank)) {
                throw sourceFailure(Kind.INVALID_REQUEST, "GitLab 地址必须包含 group/project");
            }
            String project = String.join("/", parts);
            return new Repository(URI.create(uri.toString().replace(uri.getRawPath(), "")), stripGit(project), false);
        }

        URI commitApiUrl(String revision) {
            if (github) return URI.create(base + "/repos/" + project + "/commits/" + encoded(revision));
            return URI.create(base + "/api/v4/projects/" + encoded(project) + "/repository/commits/" + encoded(revision));
        }

        URI archiveUrl(String commit) {
            if (github) return URI.create("https://codeload.github.com/" + project + "/zip/" + encoded(commit));
            return URI.create(base + "/api/v4/projects/" + encoded(project) + "/repository/archive.zip?sha=" + encoded(commit));
        }

        private static String stripGit(String value) {
            return value.endsWith(".git") ? value.substring(0, value.length() - 4) : value;
        }
    }

    public static final class SkillSourceException extends RuntimeException {
        private final Kind kind;

        public SkillSourceException(Kind kind, String message) {
            super(message);
            this.kind = kind;
        }

        public SkillSourceException(Kind kind, String message, Throwable cause) {
            super(message, cause);
            this.kind = kind;
        }

        public Kind kind() { return kind; }
    }

    public enum Kind { INVALID_REQUEST, AUTH_FAILED, UPSTREAM_INVALID, UPSTREAM_UNAVAILABLE }
}
