/**
 * [INPUT]: 依赖真实 Gateway、共享 EmbeddedChannel/授权夹具与并发 HTTP 等价调用。
 * [OUTPUT]: 验证准确连接 CAS、撤销、重复/并发断开、Host 在线与旧帧不能误伤替代连接。
 * [POS]: remote 的接管行为回归；不新增 wire 帧，也不依赖插件升级。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import com.owndsh.enterprise.remote.domain.RemoteControlException;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("dev")
class RemoteGatewayDisconnectTest extends RemoteGatewayFixture {
    private static final String NEW_LINK = "rln_01ARZ3NDEKTSV4RRFFQ69G5FAW";
    private static final String NEW_CONTROLLER = "ctl_01ARZ3NDEKTSV4RRFFQ69G5FAW";

    @Test
    void exactDisconnectRevokesBeforeReturnAndPreservesHostPresence() {
        try (var pair = new Pair()) {
            assertThat(pair.gateway.currentConnection(HOST_ID)).isEmpty();
            pair.connect(); pair.handshake(); pair.acquire();
            assertThat(pair.gateway.currentConnection(HOST_ID)).contains(LINK_ID);
            pair.gateway.disconnect(HOST_ID, LINK_ID);
            assertThat(pair.authorizer.revoked).containsExactly(LINK_ID);
            assertThat(pair.authorizer.isLeaseActive(LINK_ID, LEASE_ID)).isFalse();
            assertThat(pair.gateway.currentConnection(HOST_ID)).isEmpty();
            assertClose(pair.host, "ENT_REMOTE_TAKEN_OVER");
            assertClose(pair.controller, "ENT_REMOTE_TAKEN_OVER");
            assertThat(pair.host.isActive()).isTrue();
            send(pair.host, "presence.update", "\"state\":\"READY\",\"remoteEnabled\":true,\"capabilities\":[\"remote.connect\"]");
            assertThat(pair.authorizer.presenceTime).isEqualTo(pair.clock.millis());
            pair.controller.writeInbound(new TextWebSocketFrame(relay(0)));
            assertThat((Object) pair.host.readOutbound()).isNull();
        }
    }

    @Test
    void disconnectAlsoRemovesUnleasedHandshakeAndDuplicateIsIdempotent() {
        try (var pair = new Pair()) {
            pair.connect();
            pair.gateway.disconnect(HOST_ID, LINK_ID);
            assertClose(pair.host, "ENT_REMOTE_TAKEN_OVER"); assertClose(pair.controller, "ENT_REMOTE_TAKEN_OVER");
            pair.gateway.disconnect(HOST_ID, LINK_ID);
            assertThat(pair.authorizer.revoked).containsExactly(LINK_ID);
            assertThat(pair.authorizer.releases).isZero();
            assertThat((Object) pair.host.readOutbound()).isNull();
        }
    }

    @Test
    void staleConfirmationAndLateOldFramesLeaveReplacementUntouched() {
        try (var pair = new Pair()) {
            pair.connect(); pair.handshake(); pair.acquire();
            pair.gateway.disconnect(HOST_ID, LINK_ID);
            assertClose(pair.host, "ENT_REMOTE_TAKEN_OVER"); assertClose(pair.controller, "ENT_REMOTE_TAKEN_OVER");
            EmbeddedChannel next = pair.channel("controller", NEW_CONTROLLER, new AtomicBoolean(true));
            try {
                send(next, "connect.request", request(HOST_ID, NEW_CONTROLLER, NEW_LINK));
                assertThat(read(pair.host).path("payload").path("linkId").asText()).isEqualTo(NEW_LINK);
                assertThatThrownBy(() -> pair.gateway.disconnect(HOST_ID, LINK_ID))
                    .isInstanceOfSatisfying(RemoteControlException.class, error -> assertThat(error.code()).isEqualTo("ENT_REMOTE_BUSY"));
                send(pair.host, "connect.reject", link() + ",\"code\":\"ENT_REMOTE_BUSY\",\"message\":\"late\"");
                send(pair.host, "connection.lease.release", lease());
                pair.host.writeInbound(new TextWebSocketFrame(relay(0)));
                assertThat((Object) pair.host.readOutbound()).isNull();
                assertThat((Object) next.readOutbound()).isNull();
                send(pair.host, "connect.accept", "\"linkId\":\"" + NEW_LINK + "\",\"expiresAt\":0");
                assertThat(read(next).path("type").asText()).isEqualTo("connect.accept");
                assertThat(pair.gateway.currentConnection(HOST_ID)).contains(NEW_LINK);
                assertThat(pair.authorizer.revoked).containsExactly(LINK_ID);
                send(pair.controller, "error", "\"linkId\":\"" + NEW_LINK + "\",\"code\":\"ENT_REMOTE_CLOSED\",\"message\":\"foreign\",\"retryable\":false");
                assertThat(read(pair.controller).path("payload").path("code").asText()).isEqualTo("ENT_REMOTE_LINK_NOT_FOUND");
                assertThat(pair.gateway.currentConnection(HOST_ID)).contains(NEW_LINK);
            } finally { next.finishAndReleaseAll(); }
        }
    }

    @Test
    void failedAuthorizationRevokeFailsClosedWithoutDisconnectingHost() {
        try (var pair = new Pair()) {
            pair.connect(); pair.handshake(); pair.acquire();
            pair.authorizer.revokeFails = true;
            assertThatThrownBy(() -> pair.gateway.disconnect(HOST_ID, LINK_ID)).isInstanceOf(IllegalStateException.class);
            assertThat(pair.gateway.currentConnection(HOST_ID)).isEmpty();
            assertClose(pair.host, "ENT_REMOTE_TAKEN_OVER"); assertClose(pair.controller, "ENT_REMOTE_TAKEN_OVER");
            assertThat(pair.host.isActive()).isTrue();
        }
    }

    @Test
    void concurrentDuplicateRequestsRevokeAndNotifyOnce() throws Exception {
        try (var pair = new Pair(); var executor = Executors.newFixedThreadPool(2)) {
            pair.connect(); pair.handshake(); pair.acquire();
            CountDownLatch ready = new CountDownLatch(2);
            CountDownLatch start = new CountDownLatch(1);
            var first = executor.submit(() -> { ready.countDown(); start.await(); pair.gateway.disconnect(HOST_ID, LINK_ID); return null; });
            var second = executor.submit(() -> { ready.countDown(); start.await(); pair.gateway.disconnect(HOST_ID, LINK_ID); return null; });
            assertThat(ready.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            start.countDown(); first.get(5, java.util.concurrent.TimeUnit.SECONDS); second.get(5, java.util.concurrent.TimeUnit.SECONDS);
            pair.host.runPendingTasks(); pair.controller.runPendingTasks();
            assertThat(pair.authorizer.releases).isEqualTo(1);
            assertClose(pair.host, "ENT_REMOTE_TAKEN_OVER"); assertClose(pair.controller, "ENT_REMOTE_TAKEN_OVER");
            assertThat((Object) pair.host.readOutbound()).isNull();
            assertThat((Object) pair.controller.readOutbound()).isNull();
        }
    }
}
