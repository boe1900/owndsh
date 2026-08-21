/**
 * [INPUT]: 依赖 Cordis 官方树外插件 apply 生命周期。
 * [OUTPUT]: 提供候选受管工具 1.1.0 的可发现服务事实。
 * [POS]: T22 当前版本最小真实 Loader 插件，不访问网络或用户数据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const name = 'enterprise-candidate-tools';
export const version = '1.1.0';
export function apply(ctx) {
  ctx.provide('enterpriseCandidateTools', { version });
}
