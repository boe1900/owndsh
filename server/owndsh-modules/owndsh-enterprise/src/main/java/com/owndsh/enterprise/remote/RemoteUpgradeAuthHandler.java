/**
 * [INPUT]: 依赖 Netty HTTP upgrade request、Bearer/Cookie 凭据和部署声明的可信来源。
 * [OUTPUT]: Cookie 握手必须来自可信 Origin，显式 Remote 来源限制适用于所有握手。校验后才保存 Peer identity 和会话重验回调。
 * [POS]: remote 的网络信任边界；平台 Sa-Token 由 RemotePeerAuthenticator adapter 提供。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInboundHandlerAdapter;
import io.netty.handler.codec.http.HttpHeaderNames;
import io.netty.handler.codec.http.HttpRequest;
import io.netty.util.AttributeKey;
import io.netty.util.ReferenceCountUtil;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.BooleanSupplier;

public final class RemoteUpgradeAuthHandler extends ChannelInboundHandlerAdapter {
    public static final AttributeKey<RemotePeerIdentity> PEER_IDENTITY = AttributeKey.valueOf("owndsh.remote.peerIdentity");
    public static final AttributeKey<BooleanSupplier> SESSION_ACTIVE = AttributeKey.valueOf("owndsh.remote.sessionActive");
    private final String allowedOrigin;
    private final Set<String> consoleOrigins;
    private final RemotePeerAuthenticator authenticator;

    public RemoteUpgradeAuthHandler(
        RemoteNettyProperties properties,
        RemotePeerAuthenticator authenticator,
        Set<String> consoleOrigins
    ) {
        this.allowedOrigin = properties.getAllowedOrigin();
        this.authenticator = Objects.requireNonNull(authenticator, "authenticator");
        this.consoleOrigins = Set.copyOf(consoleOrigins);
    }

    @Override
    public void channelRead(ChannelHandlerContext context, Object message) {
        if (message instanceof HttpRequest request) {
            String bearer = bearerToken(request.headers().get(HttpHeaderNames.AUTHORIZATION));
            if (!allowsOrigin(request, bearer == null)) {
                ReferenceCountUtil.release(message);
                context.close();
                return;
            }
            String token = bearer != null ? bearer : cookieToken(request.headers().get(HttpHeaderNames.COOKIE));
            Optional<RemotePeerIdentity> identity = token == null ? Optional.empty() : authenticator.authenticate(token);
            if (identity.isEmpty()) {
                ReferenceCountUtil.release(message);
                context.close();
                return;
            }
            context.channel().attr(PEER_IDENTITY).set(identity.get());
            context.channel().attr(SESSION_ACTIVE).set(() -> authenticator.authenticate(token).filter(identity.get()::equals).isPresent());
        }
        context.fireChannelRead(message);
    }

    private boolean allowsOrigin(HttpRequest request, boolean cookieAuth) {
        if (!cookieAuth && allowedOrigin.isBlank()) return true;
        List<String> origins = request.headers().getAll(HttpHeaderNames.ORIGIN);
        if (origins.size() != 1) return false;
        String origin = origins.getFirst();
        if (cookieAuth && (origin.isBlank() || "null".equals(origin))) return false;
        return allowedOrigin.isBlank() ? consoleOrigins.contains(origin) : allowedOrigin.equals(origin);
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
