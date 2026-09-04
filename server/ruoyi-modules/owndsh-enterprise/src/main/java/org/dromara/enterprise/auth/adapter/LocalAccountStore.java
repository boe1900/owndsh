/**
 * [INPUT]: 接收未经信任的本地用户名，以及认证后受限的 userId/旧 hash/新 hash 改密条件。
 * [OUTPUT]: 对外提供 sys_user 最小账号查询、首次改密和已登录用户常规改密的原子密码更新。
 * [POS]: LOCAL adapter 的持久化 DIP 端口，旧 hash 条件更新阻止并发改密覆盖和任意密码重置。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.adapter;

import java.util.Optional;

/**
 * 本地账号查询端口。
 */
public interface LocalAccountStore {
    Optional<LocalAccount> findByUsername(String username);

    default boolean changePasswordIfRequired(long userId, String expectedHash, String newHash) {
        return false;
    }

    default boolean changePassword(long userId, String expectedHash, String newHash) {
        return false;
    }
}
