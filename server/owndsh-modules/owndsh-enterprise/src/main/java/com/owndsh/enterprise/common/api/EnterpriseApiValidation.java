/**
 * [INPUT]: 接收 Spring 已解析的管理写请求 Idempotency-Key UUID 与列表 limit。
 * [OUTPUT]: 对外提供 UUID v4 和 1..200 页大小约束校验。
 * [POS]: common/api 的管理协议小型验证器，避免每个纵向 Controller 漂移出不同规则。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.common.api;

import java.util.Objects;
import java.util.UUID;

/**
 * 企业 API 公共输入校验。
 */
public final class EnterpriseApiValidation {
    private EnterpriseApiValidation() {
    }

    public static void requireUuidV4(UUID value, String name) {
        Objects.requireNonNull(value, name);
        if (value.version() != 4 || value.variant() != 2) {
            throw new IllegalArgumentException(name + " 必须是 UUID v4");
        }
    }

    public static int requirePageLimit(int limit) {
        if (limit < 1 || limit > 200) {
            throw new IllegalArgumentException("limit 必须在 1..200");
        }
        return limit;
    }
}
