/**
 * [INPUT]: 组合不可变 UsageLedger 与当前 RuoYi 用户/部门、受管模型的只读显示语义。
 * [OUTPUT]: 对外提供管理端用量列表所需的 prompt-free 语义投影。
 * [POS]: quota/domain 的查询模型，不参与预留或结算，名称变化不改写历史计费事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.quota.domain;

import java.util.Objects;

public record UsageLedgerMetadata(
    UsageLedger ledger,
    String username,
    String userDisplayName,
    Long departmentId,
    String departmentName,
    String modelAlias,
    String modelDisplayName
) {
    public UsageLedgerMetadata {
        Objects.requireNonNull(ledger, "ledger");
        username = requireText(username, "username");
        userDisplayName = requireText(userDisplayName, "userDisplayName");
        if ((departmentId == null) != (departmentName == null)) {
            throw new IllegalArgumentException("部门 ID 与名称必须同时存在或同时为空");
        }
        if (departmentId != null && departmentId <= 0) {
            throw new IllegalArgumentException("departmentId 必须为正数");
        }
        if (departmentName != null) departmentName = requireText(departmentName, "departmentName");
        modelAlias = requireText(modelAlias, "modelAlias");
        modelDisplayName = requireText(modelDisplayName, "modelDisplayName");
    }

    public long id() {
        return ledger.id();
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        if (value.isBlank()) throw new IllegalArgumentException(name + " 不能为空");
        return value;
    }
}
