/**
 * [INPUT]: 依赖共享协议夹具、两个真实 Netty eventloop、latch 与可拒绝任务的 executor。
 * [OUTPUT]: 验证目标 loop 尚未运行时的有界准入，以及跨 loop 提交拒绝后的 frame 释放和准确 carrier 关闭。
 * [POS]: remote 发送的线程边界回归；仅 transport sink 为测试实现，pipeline、write task、promise 和 eventloop 均使用 Netty。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import io.netty.channel.AbstractChannel;
import io.netty.channel.ChannelConfig;
import io.netty.channel.ChannelMetadata;
import io.netty.channel.ChannelOutboundBuffer;
import io.netty.channel.ChannelPromise;
import io.netty.channel.DefaultChannelConfig;
import io.netty.channel.DefaultEventLoop;
import io.netty.channel.DefaultEventLoopGroup;
import io.netty.channel.EventLoop;
import io.netty.handler.codec.http.websocketx.CloseWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketFrame;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import java.net.SocketAddress;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("dev")
class RemoteGatewayEventLoopTest extends RemoteGatewayFixture {
    @Test
    void targetLoopNotYetRunningStillConsumesTheWholeFrameBudget() throws Exception {
        try (var pair = new LoopPair()) {
            RemotePendingWrites pending = new RemotePendingWrites();
            pending.holdClose = true;
            pair.host.eventLoop().submit(() -> pair.host.pipeline().addFirst(pending)).get(5, TimeUnit.SECONDS);
            CountDownLatch entered = new CountDownLatch(1);
            CountDownLatch release = new CountDownLatch(1);
            pair.host.eventLoop().execute(() -> {
                entered.countDown();
                try {
                    if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("target loop release timed out");
                } catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
            });
            try {
                assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
                pair.controller.eventLoop().submit(() -> {
                    for (int i = 0; i < 256; i++) pair.controller.pipeline().fireChannelRead(new TextWebSocketFrame(relay(i)));
                }).get(5, TimeUnit.SECONDS);
                assertThat(pending.writes).isEmpty();
                assertThat(pair.controller.received).isEmpty();
                pair.controller.input(relay(256));
                assertThat(pair.controller.readJson().path("code").asText()).isEqualTo("ENT_REMOTE_UNAVAILABLE");
                assertThat(pair.controller.isActive()).isTrue();
                assertThat(pending.writes).isEmpty();
                assertThat(pair.authorizer.releases).isEqualTo(1);
            } finally { release.countDown(); }
            pair.host.eventLoop().submit(() -> {
                assertThat(pending.textCount()).isEqualTo(256);
                assertThat(pending.closes).isEqualTo(1);
                pending.failPending();
                assertReleased(pending);
            }).get(5, TimeUnit.SECONDS);
            assertThat(pair.host.closeFuture().await(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void rejectedCrossLoopSubmissionReleasesTheFrameAndNotifiesTheHealthyPeer() throws Exception {
        try (var pair = new LoopPair()) {
            ((RejectingEventLoop) pair.host.eventLoop()).rejectNext.set(true);
            pair.controller.input(relay(0));
            assertThat(pair.controller.readJson().path("code").asText()).isEqualTo("ENT_REMOTE_UNAVAILABLE");
            assertThat(pair.host.closeFuture().await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(pair.controller.isActive()).isTrue();
            assertThat(pair.authorizer.releases).isEqualTo(1);
            assertThat(pair.host.closeCodes.poll(5, TimeUnit.SECONDS)).isEqualTo(4503);
            assertThat(pair.host.closeCodes).isEmpty();
            assertThat(pair.host.submitted).allSatisfy(frame -> assertThat(frame.refCnt()).isZero());
            assertThat(pair.host.received).isEmpty();
        }
    }

    @Test
    void rejectedCloseDeadlineStillClosesTheCarrierAndSettlesItsBacklog() throws Exception {
        try (var pair = new LoopPair()) {
            RemotePendingWrites pending = new RemotePendingWrites();
            pair.host.eventLoop().submit(() -> pair.host.pipeline().addFirst(pending)).get(5, TimeUnit.SECONDS);
            pair.controller.eventLoop().submit(() -> {
                for (int i = 0; i < 256; i++) pair.controller.pipeline().fireChannelRead(new TextWebSocketFrame(relay(i)));
            }).get(5, TimeUnit.SECONDS);
            pair.host.eventLoop().submit(() -> assertThat(pending.textCount()).isEqualTo(256)).get(5, TimeUnit.SECONDS);
            ((RejectingEventLoop) pair.host.eventLoop()).rejectNext.set(true);
            pair.controller.input(relay(256));
            assertThat(pair.controller.readJson().path("code").asText()).isEqualTo("ENT_REMOTE_UNAVAILABLE");
            assertThat(pair.host.closeFuture().await(5, TimeUnit.SECONDS)).isTrue();
            pair.host.eventLoop().submit(() -> assertReleased(pending)).get(5, TimeUnit.SECONDS);
            assertThat(pair.controller.isActive()).isTrue();
            assertThat(pair.host.closeCodes).isEmpty();
        }
    }

    private static final class LoopPair implements AutoCloseable {
        private final DefaultEventLoopGroup loops = new DefaultEventLoopGroup(2) {
            @Override protected EventLoop newChild(Executor executor, Object... args) {
                return new RejectingEventLoop(executor);
            }
        };
        private final MutableClock clock = new MutableClock();
        private final FakeAuthorizer authorizer = new FakeAuthorizer(clock);
        private final RemoteGateway gateway = new RemoteGateway(JSON, authorizer, clock);
        private final LoopChannel host = new LoopChannel();
        private final LoopChannel controller = new LoopChannel();

        private LoopPair() throws Exception {
            initialize(host, "host", HOST_ID);
            initialize(controller, "controller", CONTROLLER_ID);
            assertThat(host.eventLoop()).isNotSameAs(controller.eventLoop());
            controller.input(control("connect.request", request(HOST_ID, CONTROLLER_ID, LINK_ID))); host.readJson();
            host.input(control("connect.accept", link() + ",\"expiresAt\":0")); controller.readJson();
            controller.input(control("transport.selected", link() + ",\"kind\":\"relay\"")); host.readJson();
            controller.input(control("secure.handshake", handshake(0))); host.readJson();
            host.input(control("secure.handshake", handshake(1))); controller.readJson();
            controller.input(control("connection.lease.acquire", lease())); host.readJson(); controller.readJson();
            host.submitted.clear();
        }

        private void initialize(LoopChannel channel, String role, String id) throws Exception {
            channel.attr(RemoteUpgradeAuthHandler.SESSION_ACTIVE).set(() -> true);
            channel.attr(RemoteUpgradeAuthHandler.PEER_IDENTITY).set(new RemotePeerIdentity("tenant", 1, "harness", "installation"));
            channel.pipeline().addLast(new RemoteWebSocketHandler(JSON, RemoteProtocol.MAX_FRAME_BYTES, gateway));
            loops.register(channel).get(5, TimeUnit.SECONDS);
            channel.input(control("hello", hello(role, id)));
            assertThat(channel.readJson().path("type").asText()).isEqualTo("hello.ack");
        }

        @Override public void close() throws Exception {
            try {
                controller.close().get(5, TimeUnit.SECONDS);
                host.close().get(5, TimeUnit.SECONDS);
            } finally { loops.shutdownGracefully(0, 1, TimeUnit.SECONDS).get(5, TimeUnit.SECONDS); }
        }
    }

    private static final class RejectingEventLoop extends DefaultEventLoop {
        private final AtomicBoolean rejectNext = new AtomicBoolean();
        private RejectingEventLoop(Executor executor) { super(executor); }
        @Override public void execute(Runnable task) {
            if (rejectNext.compareAndSet(true, false)) throw new RejectedExecutionException("injected task rejection");
            super.execute(task);
        }
    }

    private static final class LoopChannel extends AbstractChannel {
        private final ChannelConfig config = new DefaultChannelConfig(this);
        private final BlockingQueue<String> received = new LinkedBlockingQueue<>();
        private final BlockingQueue<Integer> closeCodes = new LinkedBlockingQueue<>();
        private final List<WebSocketFrame> submitted = new CopyOnWriteArrayList<>();
        private volatile boolean open = true;

        private LoopChannel() {
            super(null);
            config.setMessageSizeEstimator(() -> message -> {
                if (message instanceof WebSocketFrame frame) {
                    submitted.add(frame);
                    return frame.content().readableBytes();
                }
                return 0;
            });
        }

        private void input(String message) throws Exception {
            eventLoop().submit(() -> pipeline().fireChannelRead(new TextWebSocketFrame(message))).get(5, TimeUnit.SECONDS);
        }
        private JsonNode readJson() throws InterruptedException {
            String message = received.poll(5, TimeUnit.SECONDS);
            assertThat(message).isNotNull();
            return JSON.readTree(message);
        }
        @Override public ChannelConfig config() { return config; }
        @Override public boolean isOpen() { return open; }
        @Override public boolean isActive() { return open; }
        @Override public ChannelMetadata metadata() { return new ChannelMetadata(false); }
        @Override protected boolean isCompatible(EventLoop loop) { return true; }
        @Override protected SocketAddress localAddress0() { return null; }
        @Override protected SocketAddress remoteAddress0() { return null; }
        @Override protected void doBind(SocketAddress address) {}
        @Override protected void doDisconnect() { doClose(); }
        @Override protected void doClose() { open = false; }
        @Override protected void doBeginRead() {}
        @Override protected void doWrite(ChannelOutboundBuffer buffer) {
            while (buffer.current() != null) {
                Object message = buffer.current();
                if (message instanceof TextWebSocketFrame text) received.add(text.text());
                if (message instanceof CloseWebSocketFrame close) closeCodes.add(close.statusCode());
                buffer.remove();
            }
        }
        @Override protected AbstractUnsafe newUnsafe() {
            return new AbstractUnsafe() {
                @Override public void connect(SocketAddress remote, SocketAddress local, ChannelPromise promise) { promise.setSuccess(); }
            };
        }
    }
}
