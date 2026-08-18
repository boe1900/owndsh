/**
 * [INPUT]: 汇总 Enterprise adapter、注册生命周期、OpenAI 请求、SSE 传输与 StreamChunk 翻译模块
 * [OUTPUT]: 对外提供 T11 Harness 模型链路的稳定 package API
 * [POS]: llm-gateway 的 facade，隐藏 wire 文件布局并保持官方 LlmAdapter 作为唯一 Harness 边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export * from './adapter.js'
export * from './registration.js'
export * from './serialize.js'
export * from './translate.js'
export * from './transport.js'
export type * from './wire.js'
