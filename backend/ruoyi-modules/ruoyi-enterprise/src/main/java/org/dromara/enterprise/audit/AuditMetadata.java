/**
 * [INPUT]: 由各业务 action 的显式 metadata record 实现，不接受 Controller Map。
 * [OUTPUT]: 对外提供审计 metadata 的编译期 marker 边界。
 * [POS]: audit 模块的敏感数据入口闸门，使任意请求对象不能直接进入审计 JSON。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package org.dromara.enterprise.audit;

/**
 * 审计 metadata marker。每个 action 应定义自己的不可变 DTO。
 */
public interface AuditMetadata {
}
