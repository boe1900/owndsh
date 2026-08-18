/**
 * [INPUT]: 接收模型可见 system/messages/tools JSON UTF-8 字节数与请求/模型输出上限。
 * [OUTPUT]: 对外提供详细设计固定的输入向上估算和总预留 Token。
 * [POS]: quota/application 的唯一估算算法，T10 不得自行引入 tokenizer 分叉。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.application;

public final class QuotaTokenEstimator {
    private QuotaTokenEstimator() {
    }

    public static long estimate(int visibleUtf8Bytes, Integer requestedMaxTokens, int modelMaxOutputTokens) {
        if (visibleUtf8Bytes < 0 || modelMaxOutputTokens <= 0) {
            throw new IllegalArgumentException("估算输入必须非负且模型输出上限为正数");
        }
        int output = requestedMaxTokens == null ? modelMaxOutputTokens : requestedMaxTokens;
        if (output <= 0 || output > modelMaxOutputTokens) {
            throw new IllegalArgumentException("max_tokens 超出模型输出上限");
        }
        long input = Math.floorDiv((long) visibleUtf8Bytes + 2L, 3L);
        return Math.addExact(input, output);
    }
}
