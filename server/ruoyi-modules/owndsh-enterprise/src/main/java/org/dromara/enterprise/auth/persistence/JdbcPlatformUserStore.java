/**
 * [INPUT]: 依赖 Spring JdbcOperations 与 Host sys_user 字段约束。
 * [OUTPUT]: 对外提供 active Member 查询及不带部门、岗位或角色的外部成员最小创建。
 * [POS]: PlatformUserStore 的 JDBC adapter，只在 JIT 时复制初始显示名/邮箱，后续身份登录不覆盖成员资料。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.persistence;

import org.springframework.jdbc.core.JdbcOperations;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Objects;

/**
 * Host sys_user 身份同步 JDBC 存储。
 */
public final class JdbcPlatformUserStore implements PlatformUserStore {
    private static final String INSERT_SQL = """
        insert into sys_user(
            user_id, dept_id, user_name, nick_name, user_type, email, phone_number, gender, avatar,
            password, status, del_flag, login_ip, login_date,
            create_dept, create_by, create_time, update_by, update_time, remark
        ) values (?, ?, ?, ?, 'sys_user', ?, '', '0', null, '', '0', '0', '', ?, ?, ?, ?, ?, ?, 'External identity')
        """;
    private final JdbcOperations jdbc;

    public JdbcPlatformUserStore(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public boolean isActive(long userId) {
        Boolean exists = jdbc.queryForObject(
            "select exists(select 1 from sys_user where user_id = ? and status = '0' and del_flag = '0')",
            Boolean.class,
            userId
        );
        return Boolean.TRUE.equals(exists);
    }

    @Override
    public boolean usernameExists(String username) {
        Boolean exists = jdbc.queryForObject(
            "select exists(select 1 from sys_user where user_name = ? and del_flag = '0')",
            Boolean.class,
            username
        );
        return Boolean.TRUE.equals(exists);
    }

    @Override
    public void insert(
        long userId,
        String username,
        String displayName,
        String email,
        Instant loginAt
    ) {
        LocalDateTime timestamp = LocalDateTime.ofInstant(loginAt, ZoneOffset.UTC);
        jdbc.update(
            INSERT_SQL,
            userId,
            null,
            username,
            displayName,
            email == null ? "" : email,
            timestamp,
            null,
            userId,
            timestamp,
            userId,
            timestamp
        );
    }
}
