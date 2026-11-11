/**
 * [INPUT]: 依赖共享 RemoteGatewayFixture、可控出站 promise 与 EmbeddedChannel 虚拟时间。
 * [OUTPUT]: 验证实际 UTF-8/帧数预算、完成回收、单次终止、撤权、新旧 Channel 隔离及同步失败重入。
 * [POS]: remote carrier 发送生命周期回归；通过接纳帧、对端通知、租约释放和 refCnt 观察预算边界。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.CloseWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class RemoteGatewayOutboundTest extends RemoteGatewayFixture {
    @Test
    void frameBudgetIncludesEveryPendingWriteAndOnlyStopsTheSlowCarrier() {
        try (var pair = new Pair(); var healthy = new Pair(pair, "9002",
            "ctl_01ARZ3NDEKTSV4RRFFQ69G5FAW", "rln_01ARZ3NDEKTSV4RRFFQ69G5FAW")) {
            pair.connect(); pair.handshake(); pair.acquire();
            healthy.connect(); healthy.handshake(); healthy.acquire();
            RemotePendingWrites pending = hold(pair.host);
            pending.holdClose = true;
            pair.host.freezeTime();
            for (int i = 0; i < 256; i++) relay(pair, i);
            assertThat(pending.textCount()).isEqualTo(256);
            assertThat(pair.host.isActive()).isTrue();
            relay(pair, 256);
            assertThat(pending.textCount()).isEqualTo(256);
            assertThat(pending.closes).isEqualTo(1);
            assertClose(pair.controller, "ENT_REMOTE_UNAVAILABLE");
            assertThat(pair.controller.isActive()).isTrue();
            assertThat(pair.authorizer.releases).isEqualTo(1);
            healthy.controller.writeInbound(new TextWebSocketFrame(relay(0).replace(LINK_ID, healthy.linkId)));
            assertThat(read(healthy.host).path("kind").asText()).isEqualTo("data");
            send(pair.host, "presence.update", "\"state\":\"READY\"");
            assertThat(pending.closes).isEqualTo(1);
            pair.host.advanceTimeBy(999, TimeUnit.MILLISECONDS);
            pair.host.runScheduledPendingTasks();
            assertThat(pair.host.isActive()).isTrue();
            pair.host.advanceTimeBy(1, TimeUnit.MILLISECONDS);
            pair.host.runScheduledPendingTasks();
            assertThat(pair.host.isActive()).isFalse();
            assertReleased(pending);
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1})
    void byteBudgetUsesSerializedUtf8AndTenByteHeaderWithInclusiveLimit(int excess) {
        try (var pair = new Pair()) {
            pair.connect(); pair.accept();
            RemotePendingWrites pending = hold(pair.host);
            pending.holdClose = true;
            String last = candidate(256);
            for (int i = 0; i < 31; i++) pair.controller.writeInbound(new TextWebSocketFrame(candidate(131_072)));
            pair.controller.writeInbound(new TextWebSocketFrame(candidate(131_072 - 256 + excess)));
            pair.controller.writeInbound(new TextWebSocketFrame(last));
            assertThat(pending.textCount()).isEqualTo(excess == 0 ? 33 : 32);
            assertThat(pending.closes).isEqualTo(excess);
            if (excess == 0) {
                assertThat(pending.writes.stream().mapToLong(write -> write.frame().content().readableBytes() + 10).sum())
                    .isEqualTo(4 * 1024 * 1024);
                pending.writes.getFirst().succeed();
                pair.controller.writeInbound(new TextWebSocketFrame(candidate(131_072)));
                assertThat(pending.textCount()).isEqualTo(34);
                assertThat(pending.closes).isZero();
            } else {
                assertClose(pair.controller, "ENT_REMOTE_UNAVAILABLE");
            }
        }
    }

    @Test
    void successfulFuturesReturnFrameCapacityWithoutWaitingForWritability() {
        try (var pair = new Pair()) {
            pair.connect(); pair.handshake(); pair.acquire();
            RemotePendingWrites pending = hold(pair.host);
            for (int i = 0; i < 256; i++) relay(pair, i);
            pair.host.unsafe().outboundBuffer().setUserDefinedWritability(1, false);
            for (int i = 0; i < 32; i++) pending.writes.get(i).succeed();
            for (int i = 256; i < 288; i++) relay(pair, i);
            assertThat(pending.textCount()).isEqualTo(288);
            assertThat(pair.host.isActive()).isTrue();
            relay(pair, 288);
            assertClose(pair.controller, "ENT_REMOTE_UNAVAILABLE");
            assertThat(pending.closes).isEqualTo(1);
            assertReleased(pending);
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void synchronousLeaseAckFailureStopsBroadcastAndReleasesLeaseOnce(boolean failBoth) {
        try (var pair = new Pair()) {
            pair.connect(); pair.handshake();
            RemotePendingWrites host = hold(pair.host);
            host.failText = true;
            RemotePendingWrites controller = failBoth ? hold(pair.controller) : null;
            if (controller != null) controller.failText = true;
            send(pair.controller, "connection.lease.acquire", lease());
            assertThat(pair.host.isActive()).isFalse();
            assertThat(pair.authorizer.releases).isEqualTo(1);
            if (failBoth) {
                assertThat(pair.controller.isActive()).isFalse();
                assertThat(controller.textCount()).isEqualTo(1);
                assertReleased(controller);
            } else {
                assertClose(pair.controller, "ENT_REMOTE_UNAVAILABLE");
                assertThat((Object) pair.controller.readOutbound()).isNull();
                assertThat(pair.controller.isActive()).isTrue();
            }
            pair.advance(61);
            assertThat(pair.authorizer.releases).isEqualTo(1);
            assertThat(host.textCount()).isEqualTo(1);
            assertReleased(host);
        }
    }

    @Test
    void outboundHandlerExceptionBecomesOneTerminalFailureWithoutDoubleRelease() {
        try (var pair = new Pair()) {
            pair.connect(); pair.handshake(); pair.acquire();
            RemotePendingWrites pending = hold(pair.host);
            pending.throwText = true;
            relay(pair, 0);
            assertClose(pair.controller, "ENT_REMOTE_UNAVAILABLE");
            assertThat(pair.host.isActive()).isFalse();
            assertThat(pending.closes).isEqualTo(1);
            assertReleased(pending);
        }
    }

    @Test
    void lateFailedPromiseCannotCloseReplacementOrItsNewLink() {
        try (var pair = new Pair()) {
            pair.connect(); pair.handshake(); pair.acquire();
            RemotePendingWrites old = hold(pair.host);
            old.keepPendingOnClose = true;
            relay(pair, 0);
            EmbeddedChannel replacement = pair.channel("host", HOST_ID, new AtomicBoolean(true));
            try {
                assertClose(pair.controller, "ENT_REMOTE_UNAVAILABLE");
                pair.request();
                assertThat(read(replacement).path("type").asText()).isEqualTo("connect.request");
                old.writes.getFirst().fail();
                assertThat(replacement.isActive()).isTrue();
                send(replacement, "connect.accept", link() + ",\"expiresAt\":0");
                assertThat(read(pair.controller).path("type").asText()).isEqualTo("connect.accept");
                assertThat(pair.authorizer.releases).isEqualTo(1);
                assertReleased(old);
            } finally { replacement.finishAndReleaseAll(); old.failPending(); }
        }
    }

    @Test
    void asynchronousWriteFailureAndChannelCloseSettleAllOwnedFrames() {
        try (var pair = new Pair()) {
            pair.connect(); pair.handshake(); pair.acquire();
            RemotePendingWrites pending = hold(pair.host);
            for (int i = 0; i < 5; i++) relay(pair, i);
            pending.writes.get(2).fail();
            assertClose(pair.controller, "ENT_REMOTE_UNAVAILABLE");
            assertThat(pair.authorizer.releases).isEqualTo(1);
            assertThat(pending.closes).isEqualTo(1);
            assertThat(pair.host.isActive()).isFalse();
            assertReleased(pending);
        }
    }

    @Test
    void authorizationRevocationRejectsNewDataWhileAcceptedFramesAreInFlight() {
        try (var pair = new Pair()) {
            pair.connect(); pair.handshake(); pair.acquire();
            RemotePendingWrites pending = hold(pair.host);
            relay(pair, 0);
            pair.controllerSession.set(false);
            relay(pair, 1);
            assertThat(pending.textCount()).isEqualTo(2);
            assertThat(JSON.readTree(((TextWebSocketFrame) pending.writes.get(0).frame()).text()).path("seq").asInt()).isZero();
            assertThat(JSON.readTree(((TextWebSocketFrame) pending.writes.get(1).frame()).text()).path("kind").asText()).isEqualTo("close");
            CloseWebSocketFrame close = pair.controller.readOutbound();
            try { assertThat(close.statusCode()).isEqualTo(4003); }
            finally { close.release(); }
            assertThat(pair.controller.isActive()).isFalse();
            assertThat(pair.host.isActive()).isTrue();
            pending.writes.get(0).succeed();
            pending.writes.get(1).succeed();
            assertReleased(pending);
        }
    }

    @Test
    void channelInactiveReleasesHeldWritesWithoutClosingHealthyPeer() {
        try (var pair = new Pair()) {
            pair.connect(); pair.handshake(); pair.acquire();
            RemotePendingWrites pending = hold(pair.host);
            relay(pair, 0);
            pair.host.close();
            assertClose(pair.controller, "ENT_REMOTE_UNAVAILABLE");
            assertThat(pair.controller.isActive()).isTrue();
            assertThat(pair.authorizer.releases).isEqualTo(1);
            assertReleased(pending);
        }
    }

    @Test
    void unauthenticatedChannelSubmitsOnlyOneCloseAndClosesWhenItCompletes() {
        try (var pair = new Pair()) {
            RemotePendingWrites pending = new RemotePendingWrites();
            pending.holdClose = true;
            EmbeddedChannel unauthenticated = new EmbeddedChannel(pending,
                new RemoteWebSocketHandler(JSON, RemoteProtocol.MAX_FRAME_BYTES, pair.gateway));
            try {
                send(unauthenticated, "hello", hello("host", "9002"));
                send(unauthenticated, "hello", hello("host", "9002"));
                assertThat(pending.closes).isEqualTo(1);
                assertThat(pending.textCount()).isZero();
                assertThat(((CloseWebSocketFrame) pending.writes.getFirst().frame()).statusCode()).isEqualTo(4001);
                assertThat(unauthenticated.isActive()).isTrue();
                pending.writes.getFirst().succeed();
                assertThat(unauthenticated.isActive()).isFalse();
                unauthenticated.advanceTimeBy(2, TimeUnit.SECONDS);
                unauthenticated.runScheduledPendingTasks();
                assertThat(pending.closes).isEqualTo(1);
                assertReleased(pending);
            } finally { unauthenticated.finishAndReleaseAll(); }
        }
    }

    private static RemotePendingWrites hold(EmbeddedChannel channel) {
        RemotePendingWrites pending = new RemotePendingWrites();
        channel.pipeline().addFirst(pending);
        return pending;
    }

    private static void relay(Pair pair, int sequence) { pair.controller.writeInbound(new TextWebSocketFrame(relay(sequence))); }

    private static String candidate(int budgetBytes) {
        String prefix = "{\"v\":1,\"type\":\"signal.candidate\",\"id\":\"rf_01ARZ3NDEKTSV4RRFFQ69G5FAV\",\"ts\":0,\"payload\":{" + link() + ",\"candidate\":\"界";
        String suffix = "\"}}";
        int filler = budgetBytes - (prefix + suffix).getBytes(StandardCharsets.UTF_8).length - 10;
        return prefix + "x".repeat(filler) + suffix;
    }

}
