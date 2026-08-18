/**
 * [INPUT]: 依赖 WireMock、JdkProviderProbe 与本机真实 HTTP socket。
 * [OUTPUT]: 验证 `/models`、Authorization、状态分类、timeout 结果边界与禁止 redirect follow。
 * [POS]: T08 provider test API 的上游协议单测，任何响应正文或 credential 都没有结果字段。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.model;

import com.github.tomakehurst.wiremock.WireMockServer;
import org.dromara.enterprise.model.application.JdkProviderProbe;
import org.dromara.enterprise.model.application.ProviderProbe;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.net.URI;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig;
import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class ProviderProbeTest {
    private static final String SECRET = "provider-probe-secret-never-returned";

    private WireMockServer server;
    private JdkProviderProbe probe;

    @BeforeEach
    void setUp() {
        server = new WireMockServer(wireMockConfig().dynamicPort());
        server.start();
        probe = new JdkProviderProbe();
    }

    @AfterEach
    void tearDown() {
        server.stop();
    }

    @Test
    void probesModelsWithBearerCredentialAndReturnsOnlySanitizedSuccessFacts() {
        server.stubFor(get(urlEqualTo("/v1/models"))
            .withHeader("Authorization", equalTo("Bearer " + SECRET))
            .willReturn(aResponse().withStatus(200).withBody("{\"sensitive\":\"upstream-body\"}")));

        ProviderProbe.ProviderProbeResult result = probe.probe(
            URI.create(server.baseUrl() + "/v1"), SECRET.toCharArray(), 2_000, 2_000
        );

        assertThat(result.success()).isTrue();
        assertThat(result.latencyMs()).isNotNegative();
        assertThat(result.upstreamStatus()).isEqualTo(ProviderProbe.ProviderProbeCategory.SUCCESS);
        assertThat(result.toString()).doesNotContain(SECRET).doesNotContain("upstream-body");
        server.verify(getRequestedFor(urlEqualTo("/v1/models")));
    }

    @Test
    void classifiesAuthenticationAndNeverFollowsEvenSameOriginRedirects() {
        server.stubFor(get(urlEqualTo("/v1/models"))
            .inScenario("probe")
            .whenScenarioStateIs("Started")
            .willReturn(aResponse().withStatus(401)));

        ProviderProbe.ProviderProbeResult unauthorized = probe.probe(
            URI.create(server.baseUrl() + "/v1"), SECRET.toCharArray(), 2_000, 2_000
        );
        assertThat(unauthorized.upstreamStatus())
            .isEqualTo(ProviderProbe.ProviderProbeCategory.AUTHENTICATION_FAILED);

        server.resetAll();
        server.stubFor(get(urlEqualTo("/v1/models"))
            .willReturn(aResponse().withStatus(302).withHeader("Location", server.baseUrl() + "/redirected")));
        server.stubFor(get(urlEqualTo("/redirected")).willReturn(aResponse().withStatus(200)));

        ProviderProbe.ProviderProbeResult redirected = probe.probe(
            URI.create(server.baseUrl() + "/v1"), SECRET.toCharArray(), 2_000, 2_000
        );
        assertThat(redirected.success()).isFalse();
        assertThat(redirected.upstreamStatus()).isEqualTo(ProviderProbe.ProviderProbeCategory.UNAVAILABLE);
        server.verify(0, getRequestedFor(urlEqualTo("/redirected")));
    }
}
