/**
 * [INPUT]: 依赖 Spring JdbcOperations 与 RuoYi sys_user 字段约束。
 * [OUTPUT]: 对外提供外部用户最小创建、显示名/邮箱/部门/最后登录同步且绝不修改角色。
 * [POS]: PlatformUserStore 的 JDBC adapter，把身份绑定限制在 RuoYi 用户事实的安全白名单。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.persistence;

import org.springframework.jdbc.core.JdbcOperations;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Objects;

/**
 * RuoYi sys_user 身份同步 JDBC 存储。
 */
public final class JdbcPlatformUserStore implements PlatformUserStore {
    private static final String INSERT_SQL = """
        insert into sys_user(
            user_id, dept_id, user_name, nick_name, user_type, email, phone_number, gender, avatar,
            password, status, del_flag, login_ip, login_date,
            create_dept, create_by, create_time, update_by, update_time, remark
        ) values (?, ?, ?, ?, 'sys_user', ?, '', '0', null, '', '0', '0', '', ?, ?, ?, ?, ?, ?, 'External identity')
        """;
    private static final String UPDATE_WITH_DEPT_SQL = """
        update sys_user set dept_id = ?, nick_name = ?, email = ?, login_date = ?, update_time = ?
        where user_id = ? and del_flag = '0'
        """;
    private static final String UPDATE_PROFILE_SQL = """
        update sys_user set nick_name = ?, email = ?, login_date = ?, update_time = ?
        where user_id = ? and del_flag = '0'
        """;

    private final JdbcOperations jdbc;

    public JdbcPlatformUserStore(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public boolean exists(long userId) {
        Boolean exists = jdbc.queryForObject(
            "select exists(select 1 from sys_user where user_id = ? and del_flag = '0')",
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
        Long departmentId,
        Instant loginAt
    ) {
        LocalDateTime timestamp = LocalDateTime.ofInstant(loginAt, ZoneOffset.UTC);
        jdbc.update(
            INSERT_SQL,
            userId,
            departmentId,
            username,
            displayName,
            email == null ? "" : email,
            timestamp,
            departmentId,
            userId,
            timestamp,
            userId,
            timestamp
        );
    }

    @Override
    public void updateProfile(
        long userId,
        String displayName,
        String email,
        Long mappedDepartmentId,
        Instant loginAt
    ) {
        LocalDateTime timestamp = LocalDateTime.ofInstant(loginAt, ZoneOffset.UTC);
        int updated = mappedDepartmentId == null
            ? jdbc.update(UPDATE_PROFILE_SQL, displayName, email == null ? "" : email, timestamp, timestamp, userId)
            : jdbc.update(
                UPDATE_WITH_DEPT_SQL,
                mappedDepartmentId,
                displayName,
                email == null ? "" : email,
                timestamp,
                timestamp,
                userId
            );
        if (updated != 1) throw new IllegalStateException("平台用户不存在或不可更新");
    }
}
