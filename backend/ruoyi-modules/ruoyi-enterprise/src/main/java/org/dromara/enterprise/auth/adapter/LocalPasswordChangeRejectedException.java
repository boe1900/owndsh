/**
 * [INPUT]: 由 LOCAL adapter 在新密码策略、旧密码复用或原子条件更新失败时抛出。
 * [OUTPUT]: 向认证编排提供不携带账号、密码或 hash 的改密拒绝信号。
 * [POS]: auth/adapter 的受限失败边界，由 application 轮换一次性 challenge 后翻译为页面状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.adapter;

public final class LocalPasswordChangeRejectedException extends RuntimeException {
    public LocalPasswordChangeRejectedException() {
        super("新密码不符合要求", null, false, false);
    }
}
