/**
 * [INPUT]: 依赖 WireMock HTTPS、固定 artifact 坐标、Deploy-Token 和 ZIP 字节。
 * [OUTPUT]: 验证 GitLab Generic Package Registry 的上传坐标、幂等冲突和下载摘要门禁。
 * [POS]: skill/application 的 GitLab artifact adapter 回归；不替代 GitLab CE 真机联调。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

import com.github.tomakehurst.wiremock.WireMockServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509ExtendedTrustManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.net.Socket;
import javax.net.ssl.SSLEngine;
import java.util.HexFormat;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.binaryEqualTo;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.head;
import static com.github.tomakehurst.wiremock.client.WireMock.headRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.put;
import static com.github.tomakehurst.wiremock.client.WireMock.putRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class GitLabSkillArtifactStoreTest {
    private static final String TOKEN = "glpat-test-token";
    private static final String PROJECT_ID = "123";
    private static final SkillArtifactStore.ArtifactCoordinate COORDINATE =
        new SkillArtifactStore.ArtifactCoordinate("demo", "1.2.3", "abc1234");
    private static final String PATH = "/api/v4/projects/123/packages/generic/owndsh-skill-demo/1.2.3--abc1234/skill.zip";

    private WireMockServer server;
    private GitLabSkillArtifactStore store;

    @BeforeEach
    void setUp() throws Exception {
        server = new WireMockServer(wireMockConfig().dynamicHttpsPort());
        server.start();
        store = new GitLabSkillArtifactStore(trustAllHttpClient(),
            URI.create("https://localhost:" + server.httpsPort()), PROJECT_ID, TOKEN);
    }

    @AfterEach
    void tearDown() {
        server.stop();
    }

    @Test
    void uploadsFixedCoordinateWithDeployToken() {
        byte[] artifact = "zip-bytes".getBytes();
        String sha = sha256(artifact);
        server.stubFor(put(urlEqualTo(PATH)).withHeader("DEPLOY-TOKEN", equalTo(TOKEN))
            .withRequestBody(binaryEqualTo(artifact)).willReturn(aResponse().withStatus(201)));
        server.stubFor(get(urlEqualTo(PATH)).willReturn(aResponse().withStatus(200).withBody(artifact)));

        store.putIfAbsent(sha, artifact, COORDINATE);

        assertThat(store.provider()).isEqualTo("GITLAB_PACKAGE");
        assertThat(store.artifactRef(COORDINATE, sha)).isEqualTo(COORDINATE.path());
        server.verify(putRequestedFor(urlEqualTo(PATH)).withHeader("DEPLOY-TOKEN", equalTo(TOKEN)));
    }

    @Test
    void acceptsDuplicateCoordinateWhenBytesMatch() throws Exception {
        byte[] artifact = "same-bytes".getBytes();
        String sha = sha256(artifact);
        server.stubFor(put(urlEqualTo(PATH)).willReturn(aResponse().withStatus(400)));
        server.stubFor(get(urlEqualTo(PATH)).willReturn(aResponse().withStatus(200).withBody(artifact)));

        store.putIfAbsent(sha, artifact, COORDINATE);

        assertThat(store.open(sha, COORDINATE.path()).readAllBytes()).containsExactly(artifact);
        server.verify(getRequestedFor(urlEqualTo(PATH)).withHeader("DEPLOY-TOKEN", equalTo(TOKEN)));
    }

    @Test
    void rejectsDuplicateCoordinateWhenBytesDiffer() {
        byte[] expected = "expected".getBytes();
        byte[] existing = "existing".getBytes();
        String sha = sha256(expected);
        server.stubFor(put(urlEqualTo(PATH)).willReturn(aResponse().withStatus(409)));
        server.stubFor(get(urlEqualTo(PATH)).willReturn(aResponse().withStatus(200).withBody(existing)));

        assertThatThrownBy(() -> store.putIfAbsent(sha, expected, COORDINATE))
            .isInstanceOf(GitLabSkillArtifactStore.SkillArtifactException.class)
            .hasMessageContaining("内容不一致");
    }

    @Test
    void rejectsDownloadWhenTheBodyDigestDoesNotMatch() throws Exception {
        byte[] expected = "expected".getBytes();
        String sha = sha256(expected);
        server.stubFor(get(urlEqualTo(PATH)).willReturn(aResponse().withStatus(200).withBody("tampered")));

        assertThatThrownBy(() -> store.open(sha, COORDINATE.path()).readAllBytes())
            .isInstanceOf(java.io.IOException.class)
            .hasMessageContaining("SHA-256 不匹配");
    }

    @Test
    void readsContentLengthThroughHead() throws Exception {
        byte[] artifact = "head-bytes".getBytes();
        String sha = sha256(artifact);
        server.stubFor(head(urlEqualTo(PATH)).withHeader("DEPLOY-TOKEN", equalTo(TOKEN))
            .willReturn(aResponse().withStatus(200).withHeader("Content-Length", String.valueOf(artifact.length))));

        assertThat(store.size(sha, COORDINATE.path())).isEqualTo(artifact.length);
        server.verify(headRequestedFor(urlEqualTo(PATH)).withHeader("DEPLOY-TOKEN", equalTo(TOKEN)));
    }

    private static String sha256(byte[] value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }

    private static HttpClient trustAllHttpClient() throws Exception {
        X509ExtendedTrustManager trustManager = new X509ExtendedTrustManager() {
            @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            @Override public void checkClientTrusted(X509Certificate[] chain, String authType) { }
            @Override public void checkServerTrusted(X509Certificate[] chain, String authType) { }
            @Override public void checkClientTrusted(X509Certificate[] chain, String authType, Socket socket) { }
            @Override public void checkServerTrusted(X509Certificate[] chain, String authType, Socket socket) { }
            @Override public void checkClientTrusted(X509Certificate[] chain, String authType, SSLEngine engine) { }
            @Override public void checkServerTrusted(X509Certificate[] chain, String authType, SSLEngine engine) { }
        };
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(null, new TrustManager[]{trustManager}, null);
        SSLParameters parameters = new SSLParameters();
        parameters.setEndpointIdentificationAlgorithm(null);
        return HttpClient.newBuilder().sslContext(context).sslParameters(parameters)
            .followRedirects(HttpClient.Redirect.NEVER).build();
    }
}
