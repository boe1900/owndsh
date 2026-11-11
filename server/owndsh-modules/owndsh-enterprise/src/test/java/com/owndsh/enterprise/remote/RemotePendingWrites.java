/**
 * [INPUT]: 依赖 Netty 出站 WebSocketFrame 与原始 ChannelPromise。
 * [OUTPUT]: 提供可延迟/失败的写入完成边界，记录被接纳的 frame 并由测试 handler 释放自己持有的引用。
 * [POS]: remote 发送测试的慢消费者；Gateway 不可见此夹具，真实 Netty pipeline 负责调用及跨 loop 排队。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import io.netty.channel.ChannelDuplexHandler;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelPromise;
import io.netty.handler.codec.http.websocketx.CloseWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketFrame;

import java.nio.channels.ClosedChannelException;
import java.util.ArrayList;
import java.util.List;

final class RemotePendingWrites extends ChannelDuplexHandler {
    final List<Write> writes = new ArrayList<>();
    boolean holdClose;
    boolean keepPendingOnClose;
    boolean failText;
    boolean throwText;
    int closes;

    @Override
    public void write(ChannelHandlerContext context, Object message, ChannelPromise promise) {
        if (message instanceof CloseWebSocketFrame) {
            closes++;
            if (!holdClose) {
                context.write(message, promise);
                return;
            }
        }
        if (message instanceof WebSocketFrame frame) {
            Write write = new Write(frame, promise);
            writes.add(write);
            if (frame instanceof TextWebSocketFrame && throwText) {
                frame.release();
                throw new IllegalStateException("outbound handler failed after consuming frame");
            }
            if (frame instanceof TextWebSocketFrame && failText) write.fail();
            return;
        }
        context.write(message, promise);
    }

    @Override
    public void channelInactive(ChannelHandlerContext context) {
        if (!keepPendingOnClose) failPending();
        context.fireChannelInactive();
    }

    void failPending() {
        for (Write write : List.copyOf(writes)) if (!write.promise.isDone()) write.fail();
    }

    long textCount() { return writes.stream().filter(write -> write.frame instanceof TextWebSocketFrame).count(); }

    record Write(WebSocketFrame frame, ChannelPromise promise) {
        void succeed() { frame.release(); promise.setSuccess(); }
        void fail() { frame.release(); promise.setFailure(new ClosedChannelException()); }
    }
}
