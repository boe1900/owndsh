/**
 * [INPUT]: 接收 RuoYi user 查询、新建和白名单 profile/department/lastLogin 同步。
 * [OUTPUT]: 对外提供 external identity 服务所需的最小平台用户持久化端口。
 * [POS]: auth application 到 sys_user 的 DIP 边界，不授予角色且不修改密码/状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.persistence;

import java.time.Instant;

/**
 * RuoYi 平台用户写入端口。
 */
public interface PlatformUserStore {
    boolean exists(long userId);

    boolean usernameExists(String username);

    void insert(
        long userId,
        String username,
        String displayName,
        String email,
        Long departmentId,
        Instant loginAt
    );

    void updateProfile(long userId, String displayName, String email, Long mappedDepartmentId, Instant loginAt);
}
