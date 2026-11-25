/**
 * [INPUT]: 依赖 RemoteNettyProperties、可信 Console Origin、JsonMapper 和 Remote handlers。
 * [OUTPUT]: 提供可优雅停止的 Netty WebSocket listener，默认不抢占现有 Jetty HTTP 端口。
 * [POS]: remote 的 transport composition root；TLS、Origin 和 frame 上限在 pipeline 边界执行。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.Channel;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.ChannelOption;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.handler.codec.http.HttpObjectAggregator;
import io.netty.handler.codec.http.HttpServerCodec;
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolHandler;
import io.netty.handler.ssl.SslContext;
import io.netty.handler.ssl.SslContextBuilder;
import io.netty.handler.timeout.IdleStateHandler;
import org.springframework.context.SmartLifecycle;
import tools.jackson.databind.json.JsonMapper;

import java.util.Set;
import java.util.concurrent.TimeUnit;

public final class RemoteNettyServerLifecycle implements SmartLifecycle {
    private final RemoteNettyProperties properties;
    private final JsonMapper json;
    private final RemotePeerAuthenticator peerAuthenticator;
    private final RemoteGateway gateway;
    private final Set<String> consoleOrigins;
    private volatile boolean running;
    private EventLoopGroup boss;
    private EventLoopGroup workers;
    private Channel channel;

    public RemoteNettyServerLifecycle(
        RemoteNettyProperties properties,
        JsonMapper json,
        RemotePeerAuthenticator peerAuthenticator,
        RemoteGateway gateway,
        Set<String> consoleOrigins
    ) {
        this.properties = properties;
        this.json = json;
        this.peerAuthenticator = peerAuthenticator;
        this.gateway = gateway;
        this.consoleOrigins = Set.copyOf(consoleOrigins);
    }

    @Override
    public synchronized void start() {
        if (!properties.isEnabled() || running) return;
        properties.validate();
        boss = new NioEventLoopGroup(1);
        workers = new NioEventLoopGroup();
        try {
            SslContext ssl = properties.isTlsEnabled()
                ? SslContextBuilder.forServer(properties.getCertificate().toFile(), properties.getPrivateKey().toFile()).build()
                : null;
            ServerBootstrap bootstrap = new ServerBootstrap()
                .group(boss, workers)
                .channel(NioServerSocketChannel.class)
                .childOption(ChannelOption.TCP_NODELAY, true)
                .childHandler(new ChannelInitializer<SocketChannel>() {
                    @Override
                    protected void initChannel(SocketChannel socket) {
                        if (ssl != null) socket.pipeline().addLast(ssl.newHandler(socket.alloc()));
                        socket.pipeline().addLast(new HttpServerCodec());
                        socket.pipeline().addLast(new HttpObjectAggregator(properties.getMaxFrameBytes()));
                        socket.pipeline().addLast(new RemoteUpgradeAuthHandler(properties, peerAuthenticator, consoleOrigins));
                        socket.pipeline().addLast(new WebSocketServerProtocolHandler(RemoteProtocol.WEBSOCKET_PATH, null, true, properties.getMaxFrameBytes()));
                        socket.pipeline().addLast(new IdleStateHandler(0, 25, 75));
                        socket.pipeline().addLast(new RemoteWebSocketHandler(json, properties.getMaxFrameBytes(), gateway));
                    }
                });
            channel = bootstrap.bind(properties.getBindAddress(), properties.getPort()).syncUninterruptibly().channel();
            running = true;
        } catch (Exception exception) {
            stop();
            throw new IllegalStateException("failed to bind Remote Netty listener", exception);
        }
    }

    @Override
    public synchronized void stop() {
        running = false;
        if (channel != null) channel.close().awaitUninterruptibly(5, TimeUnit.SECONDS);
        channel = null;
        if (boss != null) boss.shutdownGracefully(0, 5, TimeUnit.SECONDS).awaitUninterruptibly();
        if (workers != null) workers.shutdownGracefully(0, 5, TimeUnit.SECONDS).awaitUninterruptibly();
        boss = null;
        workers = null;
    }

    @Override public boolean isRunning() { return running; }
    @Override public boolean isAutoStartup() { return true; }
    @Override public int getPhase() { return Integer.MAX_VALUE - 100; }
    @Override public void stop(Runnable callback) { stop(); callback.run(); }
}
