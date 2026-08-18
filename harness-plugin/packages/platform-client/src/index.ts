/**
 * [INPUT]: 汇总 Service、installation、PKCE、系统浏览器、bootstrap 契约与 Harness WebServer 本地 API
 * [OUTPUT]: 对外提供 ctx.enterprisePlatform 实现、七个固定方法、稳定类型与组合端口
 * [POS]: platform-client 的 package facade，屏蔽 Host 内部文件布局并保持无 Typert Remote 边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export * from './browser.js'
export * from './installation.js'
export * from './local-api.js'
export * from './pkce.js'
export * from './platform-service.js'
export * from './types.js'
