/**
 * [INPUT]: 描述业务 action 的最终成功或失败结果。
 * [OUTPUT]: 对外提供与 V4 result check 一致的 AuditResult。
 * [POS]: audit 结果分类，不承载异常正文或 stack trace。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.audit;

/**
 * 审计结果。
 */
public enum AuditResult {
    SUCCESS,
    FAILURE
}
