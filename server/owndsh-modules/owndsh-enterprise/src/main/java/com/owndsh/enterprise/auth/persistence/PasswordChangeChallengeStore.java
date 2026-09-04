/**
 * [INPUT]: 接收随机 challenge token 与已认证的 PasswordChangeChallenge。
 * [OUTPUT]: 对外提供短时 challenge 的唯一创建和原子消费端口。
 * [POS]: auth application 的一次性改密状态 DIP 边界，隐藏 Redis key、TTL 与 GETDEL。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.persistence;

import com.owndsh.enterprise.auth.domain.PasswordChangeChallenge;

import java.util.Optional;

public interface PasswordChangeChallengeStore {
    boolean createChallenge(String token, PasswordChangeChallenge challenge);

    Optional<PasswordChangeChallenge> consumeChallenge(String token);
}
