/**
 * [INPUT]: 依赖 Spring JdbcOperations 与固定部署内 Host sys_user 的状态/删除字段。
 * [OUTPUT]: 对外提供当前 ACTIVE 用户的 bootstrap 最小投影。
 * [POS]: model/persistence 的 runtime 用户 JDBC adapter，不读取 password、角色或身份源字段。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.model.persistence;

import com.owndsh.enterprise.model.application.BootstrapUser;
import org.springframework.jdbc.core.JdbcOperations;

import java.util.Objects;
import java.util.Optional;

public final class JdbcBootstrapUserStore implements BootstrapUserStore {
    private static final String FIND_SQL = """
        select user_id, user_name, nick_name, dept_id
        from sys_user
        where user_id = ? and status = '0' and del_flag = '0'
        """;

    private final JdbcOperations jdbc;

    public JdbcBootstrapUserStore(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public Optional<BootstrapUser> findActive(String tenantId, long userId) {
        return jdbc.query(
            FIND_SQL,
            (resultSet, rowNumber) -> new BootstrapUser(
                resultSet.getLong("user_id"), resultSet.getString("user_name"),
                resultSet.getString("nick_name"), resultSet.getObject("dept_id", Long.class)
            ),
            userId
        ).stream().findFirst();
    }
}
