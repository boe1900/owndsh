/**
 * [INPUT]: 接收可信 tenant 与当前平台 user ID。
 * [OUTPUT]: 对外提供 ACTIVE 且未删除 BootstrapUser 查询端口。
 * [POS]: model/persistence 的 runtime 用户事实 DIP 边界，使 bootstrap 不依赖 Host mapper 静态 API。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.persistence;

import com.owndsh.enterprise.model.application.BootstrapUser;

import java.util.Optional;

public interface BootstrapUserStore {
    Optional<BootstrapUser> findActive(String tenantId, long userId);
}
