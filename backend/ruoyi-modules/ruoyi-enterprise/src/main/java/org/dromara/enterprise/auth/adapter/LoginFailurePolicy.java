/**
 * [INPUT]: 接收用户名与恒定形态的密码失败判定回调。
 * [OUTPUT]: 对外提供复用 RuoYi 失败计数/锁定策略的 verify 端口。
 * [POS]: ruoyi-enterprise 对 ruoyi-admin 登录策略的 DIP 边界，避免反向模块依赖。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.adapter;

import java.util.function.BooleanSupplier;

/**
 * 本地密码失败计数策略。
 */
@FunctionalInterface
public interface LoginFailurePolicy {
    void verify(String username, BooleanSupplier failed);
}
