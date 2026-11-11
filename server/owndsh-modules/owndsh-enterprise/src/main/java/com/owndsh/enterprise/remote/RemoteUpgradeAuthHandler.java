/**
 * [INPUT]: 依赖 Netty HTTP upgrade request、Bearer/Cookie 会话凭据和配置的 origin。
 * [OUTPUT]: 在 WebSocket upgrade 前拒绝缺失凭据或不被允许的 Origin，保存 Peer identity 与仅内存的会话重验回调，后续帧与定时检查重验旧 carrier 会话。
 * [POS]: remote 的网络信任边界；平台 Sa-Token 由 RemotePeerAuthenticator adapter 提供。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.util.AttributeKey;
import io.netty.handler.codec.http.HttpHeaderNames;
import io.netty.handler.codec.http.HttpRequest;

import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.BooleanSupplier;
import java.util.function.Predicate;

public final class RemoteUpgradeAuthHandler extends ChannelInboundHandlerAdapter {
    public static final AttributeKey<RemotePeerIdentity> PEER_IDENTITY = AttributeKey.valueOf("owndsh.remote.peerIdentity");
    public static final AttributeKey<BooleanSupplier> SESSION_ACTIVE = AttributeKey.valueOf("owndsh.remote.sessionActive");
    private final RemoteNettyProperties properties;
    private final Function<String, Optional<RemotePeerIdentity>> authenticator;

    public RemoteUpgradeAuthHandler(RemoteNettyProperties properties, Predicate<String> tokenValidator) {
        this(properties, token -> tokenValidator.test(token)
            ? Optional.of(new RemotePeerIdentity("unknown", 1, "unknown", "unknown"))
            : Optional.empty(), true);
    }

    public RemoteUpgradeAuthHandler(
        RemoteNettyProperties properties,
        RemotePeerAuthenticator authenticator
    ) {
        this(properties, authenticator, true);
    }

    private RemoteUpgradeAuthHandler(
        RemoteNettyProperties properties,
        RemotePeerAuthenticator authenticator,
        boolean ignored
    ) {
        this.properties = Objects.requireNonNull(properties, "properties");
        this.authenticator = Objects.requireNonNull(authenticator, "authenticator")::authenticate;
    }

    @Override
    public void channelRead(ChannelHandlerContext context, Object message) {
        if (message instanceof HttpRequest request) {
            String authorization = request.headers().get(HttpHeaderNames.AUTHORIZATION);
            String token = bearerToken(authorization);
            if (token == null) token = cookieToken(request.headers().get(HttpHeaderNames.COOKIE));
            Optional<RemotePeerIdentity> identity = token == null ? Optional.empty() : authenticator.apply(token);
            if (identity.isEmpty()) {
                context.close();
                return;
            }
            context.channel().attr(PEER_IDENTITY).set(identity.get());
            String sessionToken = token;
            context.channel().attr(SESSION_ACTIVE).set(() -> authenticator.apply(sessionToken).filter(identity.get()::equals).isPresent());
            String configuredOrigin = properties.getAllowedOrigin();
            String origin = request.headers().get(HttpHeaderNames.ORIGIN);
            if (!configuredOrigin.isBlank() && !configuredOrigin.equals(origin)) {
                context.close();
                return;
            }
        }
        context.fireChannelRead(message);
    }

    @Override
    public void channelInactive(ChannelHandlerContext context) {
        context.channel().attr(SESSION_ACTIVE).set(null);
        context.fireChannelInactive();
    }

    private static String bearerToken(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ") || authorization.length() <= 7) return null;
        String token = authorization.substring(7).trim();
        return token.isBlank() ? null : token;
    }

    private static String cookieToken(String cookieHeader) {
        if (cookieHeader == null || cookieHeader.isBlank()) return null;
        for (String pair : cookieHeader.split(";")) {
            String value = pair.trim();
            int separator = value.indexOf('=');
            if (separator <= 0) continue;
            String name = value.substring(0, separator);
            if (!"__Host-enterprise-admin".equals(name) && !"enterprise-admin".equals(name)) continue;
            String token = value.substring(separator + 1).trim();
            return token.isBlank() ? null : token;
        }
        return null;
    }
}
