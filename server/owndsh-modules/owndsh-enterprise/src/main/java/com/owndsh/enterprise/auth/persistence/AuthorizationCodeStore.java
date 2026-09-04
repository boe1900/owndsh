/**
 * [INPUT]: 接收随机授权码与完整 PlatformAuthorizationCode。
 * [OUTPUT]: 对外提供 60 秒授权码的 create、原子 consume 与 cancel 端口。
 * [POS]: token exchange 的一次性状态 DIP 边界，消费必须由 Redis 单命令保证并发唯一。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.auth.persistence;

import com.owndsh.enterprise.auth.domain.PlatformAuthorizationCode;

import java.util.Optional;

public interface AuthorizationCodeStore {
    boolean createCode(PlatformAuthorizationCode authorizationCode);

    Optional<PlatformAuthorizationCode> consumeCode(String code);

    void cancelCode(String code);
}
