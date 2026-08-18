/**
 * [INPUT]: 依赖 Spring JdbcOperations 与 RuoYi sys_user 状态/逻辑删除字段。
 * [OUTPUT]: 对外提供 LocalAccountStore 的参数化 SQL 实现。
 * [POS]: LOCAL adapter 的 JDBC 边界，只读取认证必需字段且不跨越身份领域。
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
        select user_id, user_name, nick_name, email, password, status
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
            "0".equals(resultSet.getString("status"))
        ), username);
        return accounts.stream().findFirst();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
