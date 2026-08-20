/**
 * [INPUT]: 依赖 Spring JdbcOperations 与 RuoYi sys_user 状态、逻辑删除、首次改密字段。
 * [OUTPUT]: 对外提供最小账号投影和带 userId/旧 hash/标记三重条件的密码更新。
 * [POS]: LOCAL adapter 的 JDBC 边界，唯一允许认证链清除首次改密标记的位置。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.auth.adapter;

import org.springframework.jdbc.core.JdbcOperations;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * RuoYi 本地账号 JDBC 查询。
 */
public final class JdbcLocalAccountStore implements LocalAccountStore {
    private static final String FIND_SQL = """
        select user_id, user_name, nick_name, email, password, status, password_change_required
        from sys_user
        where user_name = ? and del_flag = '0'
        order by user_id
        limit 1
        """;

    private final JdbcOperations jdbc;

    public JdbcLocalAccountStore(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public Optional<LocalAccount> findByUsername(String username) {
        List<LocalAccount> accounts = jdbc.query(FIND_SQL, (resultSet, rowNumber) -> new LocalAccount(
            resultSet.getLong("user_id"),
            resultSet.getString("user_name"),
            resultSet.getString("nick_name"),
            blankToNull(resultSet.getString("email")),
            resultSet.getString("password"),
            "0".equals(resultSet.getString("status")),
            resultSet.getBoolean("password_change_required")
        ), username);
        return accounts.stream().findFirst();
    }

    @Override
    public boolean changePasswordIfRequired(long userId, String expectedHash, String newHash) {
        return jdbc.update("""
            update sys_user
               set password = ?, password_change_required = false, update_time = now()
             where user_id = ? and password = ? and password_change_required = true
               and status = '0' and del_flag = '0'
            """, newHash, userId, expectedHash) == 1;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
