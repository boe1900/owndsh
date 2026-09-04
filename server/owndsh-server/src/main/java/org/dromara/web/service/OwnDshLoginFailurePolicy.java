/**
 * [INPUT]: 依赖 owndsh-enterprise LoginFailurePolicy、SysLoginService 和 Host PASSWORD LoginType。
 * [OUTPUT]: 对外提供复用既有 Redis 失败计数、锁定时间和登录记录的 LoginFailurePolicy Bean。
 * [POS]: owndsh-server composition adapter，保持 owndsh-enterprise 不反向依赖应用入口具体服务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.web.service;

import lombok.RequiredArgsConstructor;
import org.dromara.common.core.enums.LoginType;
import org.dromara.enterprise.auth.adapter.LoginFailurePolicy;
import org.springframework.stereotype.Component;

import java.util.function.BooleanSupplier;

/**
 * 企业本地登录失败策略的 Host 适配器。
 */
@Component
@RequiredArgsConstructor
public class OwnDshLoginFailurePolicy implements LoginFailurePolicy {
    private final SysLoginService loginService;

    @Override
    public void verify(String username, BooleanSupplier failed) {
        loginService.checkLogin(LoginType.PASSWORD, username, failed::getAsBoolean);
    }
}
