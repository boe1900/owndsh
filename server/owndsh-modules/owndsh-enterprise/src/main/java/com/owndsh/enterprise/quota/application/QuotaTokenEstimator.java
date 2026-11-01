/**
 * [INPUT]: 接收模型可见 system/messages/tools JSON UTF-8 字节数与客户端可选输出上限。
 * [OUTPUT]: 对外提供详细设计固定的输入向上估算和请求级输出预留 Token。
 * [POS]: quota/application 的唯一估算算法；不读取模型 profile，也不裁决模型能力。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.application;

public final class QuotaTokenEstimator {
    private QuotaTokenEstimator() {
    }

    public static long estimate(int visibleUtf8Bytes, Integer requestedMaxTokens) {
        if (visibleUtf8Bytes < 0 || requestedMaxTokens != null && requestedMaxTokens <= 0) {
            throw new IllegalArgumentException("估算输入与请求输出上限必须合法");
        }
        long input = Math.floorDiv((long) visibleUtf8Bytes + 2L, 3L);
        return Math.addExact(input, requestedMaxTokens == null ? 0L : requestedMaxTokens);
    }
}
