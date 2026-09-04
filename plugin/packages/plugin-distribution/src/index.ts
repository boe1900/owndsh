/**
 * [INPUT]: 汇总受管插件 Service、制品校验、状态文件、CLI argv 与公开窄 port
 * [OUTPUT]: 对外提供 ctx.enterprisePluginDistribution、EnterprisePluginDistributionService 及全部 T14 契约
 * [POS]: plugin-distribution 的 package facade，供自包含企业 bundle 内联而不暴露实现目录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { EnterprisePluginDistributionService } from './service.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    enterprisePluginDistribution: EnterprisePluginDistributionService
  }
}

export * from './cli.js'
export * from './errors.js'
export * from './service.js'
export * from './state-store.js'
export * from './types.js'
export * from './verification.js'
