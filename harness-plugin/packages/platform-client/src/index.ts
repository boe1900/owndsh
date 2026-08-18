/**
 * [INPUT]: 汇总同包 PKCE 回环事务与 Harness WebServer 结构化本地 API
 * [OUTPUT]: 对外提供 platform-client 的全部稳定类型、错误与注册函数
 * [POS]: platform-client 的公开入口，被企业 bundle 组合而不暴露内部文件布局
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export * from './local-api.js'
export * from './pkce.js'
