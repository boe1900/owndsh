/**
 * [INPUT]: 接收未经信任的本地登录用户名。
 * [OUTPUT]: 对外提供 sys_user 最小账号投影的可选查询。
 * [POS]: LOCAL adapter 的持久化 DIP 端口，隐藏 RuoYi Mapper 与表结构。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.adapter;

import java.util.Optional;

/**
 * 本地账号查询端口。
 */
public interface LocalAccountStore {
    Optional<LocalAccount> findByUsername(String username);
}
