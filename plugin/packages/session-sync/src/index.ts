/**
 * [INPUT]: 汇总官方 Session Service、精确线协议、cursor store、同步 worker 与恢复事务
 * [OUTPUT]: 对外提供 EnterpriseSessionSyncService、稳定状态/配置类型及可独立测试的协议原语
 * [POS]: session-sync 的 package facade，bundle 只从此入口装配官方支持的 Session 能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export * from './errors.js'
export * from './protocol.js'
export * from './restore.js'
export * from './service.js'
export * from './state-store.js'
export type * from './types.js'
