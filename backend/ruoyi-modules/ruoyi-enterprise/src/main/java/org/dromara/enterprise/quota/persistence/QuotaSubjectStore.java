/**
 * [INPUT]: 接收当前 authenticated userId。
 * [OUTPUT]: 对外提供 ACTIVE RuoYi 用户及当前 departmentId 最小事实。
 * [POS]: quota runtime 用量入口的用户查询端口，不把 sys_user 全行带入领域层。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.persistence;

import java.util.Optional;

public interface QuotaSubjectStore {
    Optional<QuotaUser> findActiveUser(long userId);

    record QuotaUser(long id, Long departmentId) {
        public QuotaUser {
            if (id <= 0) throw new IllegalArgumentException("userId 必须为正数");
        }
    }
}
