/**
 * [INPUT]: 依赖 JdbcOperations 与 Host sys_user 的 status/del_flag/dept_id。
 * [OUTPUT]: 对外提供 ACTIVE 当前用户和部门最小投影。
 * [POS]: quota/persistence 的 runtime subject adapter，Host 系统表不虚构 tenant_id。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.quota.persistence;

import org.springframework.jdbc.core.JdbcOperations;

import java.util.Objects;
import java.util.Optional;

public final class JdbcQuotaSubjectStore implements QuotaSubjectStore {
    private final JdbcOperations jdbc;

    public JdbcQuotaSubjectStore(JdbcOperations jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    @Override
    public Optional<QuotaUser> findActiveUser(long userId) {
        return jdbc.query("""
            select user_id, dept_id from sys_user
             where user_id = ? and status = '0' and del_flag = '0'
            """, (rs, rowNum) -> new QuotaUser(
            rs.getLong("user_id"), rs.getObject("dept_id", Long.class)
        ), userId).stream().findFirst();
    }
}
