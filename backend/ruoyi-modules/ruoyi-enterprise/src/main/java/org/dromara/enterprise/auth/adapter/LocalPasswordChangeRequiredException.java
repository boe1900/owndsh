/**
 * [INPUT]: 由 LOCAL adapter 在旧密码正确、账号仍带首次改密标记时创建。
 * [OUTPUT]: 向登录编排提供不含账号或密码的待改密/候选密码拒绝控制信号。
 * [POS]: auth adapter 到 application 的可恢复流程分支，不计入密码错误或账号枚举响应。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.adapter;

public final class LocalPasswordChangeRequiredException extends RuntimeException {
    private final boolean rejected;

    public LocalPasswordChangeRequiredException(boolean rejected) {
        super("LOCAL 账号必须修改初始密码", null, false, false);
        this.rejected = rejected;
    }

    public boolean rejected() {
        return rejected;
    }
}
