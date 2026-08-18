/**
 * [INPUT]: 接收随机 OIDC state 与 OidcLoginState。
 * [OUTPUT]: 对外提供与平台授权码分区的五分钟 create/原子 consume 端口。
 * [POS]: OIDC callback 的一次性状态 DIP 边界，防止回调重放与 source/transaction 混用。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.persistence;

import org.dromara.enterprise.auth.domain.OidcLoginState;

import java.util.Optional;

public interface OidcLoginStateStore {
    boolean createOidcState(OidcLoginState state);

    Optional<OidcLoginState> consumeOidcState(String state);
}
