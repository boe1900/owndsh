/**
 * [INPUT]: 接收下载、校验、CLI、Loader 与状态持久化边界的失败分类
 * [OUTPUT]: 对外提供只携带稳定 code 的 PluginDistributionError 与归一化函数
 * [POS]: plugin-distribution 的失败防泄漏边界，库存不保存响应正文、路径或子进程输出
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export type PluginDistributionErrorCode =
  | 'ENT_PLUGIN_CORE_PROTECTED'
  | 'ENT_PLUGIN_DOWNLOAD_FAILED'
  | 'ENT_PLUGIN_SIZE_MISMATCH'
  | 'ENT_PLUGIN_HASH_MISMATCH'
  | 'ENT_PLUGIN_SIGNATURE_INVALID'
  | 'ENT_PLUGIN_INCOMPATIBLE'
  | 'ENT_PLUGIN_CLI_FAILED'
  | 'ENT_PLUGIN_LOADER_INACTIVE'
  | 'ENT_PLUGIN_STATE_INVALID'

/** 分发失败只向状态机暴露固定 code；cause 不进入持久化或平台库存。 */
export class PluginDistributionError extends Error {
  constructor(readonly code: PluginDistributionErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PluginDistributionError'
  }
}

/** 把未知 I/O 或 provider 失败收敛为调用方指定的稳定 code。 */
export function distributionError(
  error: unknown,
  fallback: PluginDistributionErrorCode,
  message: string,
): PluginDistributionError {
  return error instanceof PluginDistributionError
    ? error
    : new PluginDistributionError(fallback, message, { cause: error })
}
