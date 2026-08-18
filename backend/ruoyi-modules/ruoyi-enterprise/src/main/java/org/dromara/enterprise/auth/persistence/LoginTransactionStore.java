/**
 * [INPUT]: 接收登录事务随机 ID 与完整 LoginTransaction。
 * [OUTPUT]: 对外提供五分钟事务的 create/find/原子 consume/delete 端口。
 * [POS]: auth application 的短期状态 DIP 边界，隐藏 Redis key 与序列化细节。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.persistence;

import org.dromara.enterprise.auth.domain.LoginTransaction;

import java.util.Optional;

public interface LoginTransactionStore {
    boolean createTransaction(LoginTransaction transaction);

    Optional<LoginTransaction> find(String transactionId);

    Optional<LoginTransaction> consumeTransaction(String transactionId);

    void deleteTransaction(String transactionId);
}
