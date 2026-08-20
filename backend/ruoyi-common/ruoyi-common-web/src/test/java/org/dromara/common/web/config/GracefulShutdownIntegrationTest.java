/**
 * [INPUT]: 依赖 Spring Boot 4 graceful shutdown、真实 Jetty 随机端口与受控慢请求。
 * [OUTPUT]: 验证 context 关闭会等待已进入 Controller 的请求完成再停机。
 * [POS]: common-web 的真实 Server drain 门禁，不依赖企业数据库或外部服务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.common.web.config;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.server.servlet.context.ServletWebServerApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class GracefulShutdownIntegrationTest {
    @Test
    void drainsAnInflightJettyRequestBeforeStopping() throws Exception {
        DrainController.reset();
        ServletWebServerApplicationContext context = (ServletWebServerApplicationContext) new SpringApplicationBuilder(
            DrainApplication.class
        ).properties(Map.of(
            "server.port", "0",
            "server.shutdown", "graceful",
            "spring.lifecycle.timeout-per-shutdown-phase", "5s",
            "spring.main.banner-mode", "off"
        )).run();
        CompletableFuture<Void> shutdown = null;
        try {
            int port = context.getWebServer().getPort();
            HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/drain"))
                .timeout(Duration.ofSeconds(5))
                .GET()
                .build();
            CompletableFuture<HttpResponse<String>> response = HttpClient.newHttpClient().sendAsync(
                request, HttpResponse.BodyHandlers.ofString()
            );
            assertThat(DrainController.entered.await(2, TimeUnit.SECONDS)).isTrue();

            shutdown = CompletableFuture.runAsync(context::close);
            CompletableFuture<Void> closing = shutdown;
            assertThatThrownBy(() -> closing.get(200, TimeUnit.MILLISECONDS))
                .isInstanceOf(TimeoutException.class);

            DrainController.release.countDown();
            assertThat(response.get(3, TimeUnit.SECONDS)).satisfies(value -> {
                assertThat(value.statusCode()).isEqualTo(200);
                assertThat(value.body()).isEqualTo("drained");
            });
            shutdown.get(3, TimeUnit.SECONDS);
        } finally {
            DrainController.release.countDown();
            if (context.isActive()) context.close();
            if (shutdown != null) shutdown.get(3, TimeUnit.SECONDS);
        }
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration
    @Import(DrainController.class)
    static class DrainApplication {
    }

    @RestController
    static class DrainController {
        private static CountDownLatch entered;
        private static CountDownLatch release;

        static void reset() {
            entered = new CountDownLatch(1);
            release = new CountDownLatch(1);
        }

        @GetMapping("/drain")
        String drain() throws InterruptedException {
            entered.countDown();
            if (!release.await(3, TimeUnit.SECONDS)) throw new IllegalStateException("drain test release timeout");
            return "drained";
        }
    }
}
