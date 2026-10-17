/**
 * [INPUT]: 当前 tenant 下不存在的 skill release 资源。
 * [OUTPUT]: 提供统一 HTTP 404 映射的稳定异常。
 * [POS]: skill/application 的资源边界，不泄露跨租户存在性。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.skill.application;

public final class SkillResourceNotFoundException extends RuntimeException {
    public SkillResourceNotFoundException() {
        super("skill resource not found");
    }
}
