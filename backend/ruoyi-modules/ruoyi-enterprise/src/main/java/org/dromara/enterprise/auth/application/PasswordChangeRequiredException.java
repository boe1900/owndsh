/**
 * [INPUT]: 由登录编排把 LOCAL adapter 的待改密/候选密码拒绝信号提升为页面流程分支。
 * [OUTPUT]: 向认证 Controller 提供无 secret、无账号状态细节的重新展示表单信号与拒绝事实。
 * [POS]: auth/application 的浏览器交互控制异常，只用于仍有效的同一登录事务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.application;

public final class PasswordChangeRequiredException extends RuntimeException {
    private final boolean rejected;

    public PasswordChangeRequiredException(boolean rejected) {
        super("必须修改初始密码", null, false, false);
        this.rejected = rejected;
    }

    public boolean rejected() {
        return rejected;
    }
}
