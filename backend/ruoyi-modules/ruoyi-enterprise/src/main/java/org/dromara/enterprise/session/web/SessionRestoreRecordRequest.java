/**
 * [INPUT]: 绑定 Host 已成功创建的新本地副本 ID。
 * [OUTPUT]: 对外提供仅含 restoredSessionId 的恢复关联审计请求。
 * [POS]: session/web 的 T16 审计入口 DTO，不执行 T17 的本地目录校验或副本创建。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.session.web;

public record SessionRestoreRecordRequest(String restoredSessionId) {
}
