/**
 * [INPUT]: 接收 WebSocket Upgrade 的 Bearer/Cookie 凭据。
 * [OUTPUT]: 返回不含 Token 的可信 RemotePeerIdentity，失败时拒绝升级。
 * [POS]: remote transport 与平台会话实现之间的 DIP 接缝；Netty 不依赖 Sa-Token。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.remote;

import java.util.Optional;

@FunctionalInterface
public interface RemotePeerAuthenticator {
    Optional<RemotePeerIdentity> authenticate(String token);
}
