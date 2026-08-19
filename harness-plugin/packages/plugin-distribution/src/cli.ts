/**
 * [INPUT]: 依赖 rc.7 ctx.subprocess 的 executable lookup/spawn、固定 profile/DSH_HOME 与取消信号
 * [OUTPUT]: 对外提供 installManagedPlugin、removeManagedPlugin 及可审计的 argv 构造函数
 * [POS]: plugin-distribution 的唯一进程边界，所有参数逐项传递且永不构造 shell 命令
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { distributionError, PluginDistributionError } from './errors.js'

export interface DshPluginCommandOptions {
  readonly subprocess: SubprocessRuntime
  readonly dshCommand: string
  readonly profile: string
  readonly dshHome: string
  readonly graceMs: number
  readonly signal?: AbortSignal
}

export function installPluginArguments(profile: string, artifactPath: string): readonly string[] {
  return ['plugin', '--profile', profile, 'add', '--ignore-scripts', '--save-exact', artifactPath]
}

export function removePluginArguments(profile: string, packageName: string): readonly string[] {
  return ['plugin', '--profile', profile, 'remove', packageName]
}

async function runDshPlugin(options: DshPluginCommandOptions, args: readonly string[]): Promise<void> {
  try {
    const executable = await options.subprocess.resolveExecutable(
      options.dshCommand,
      { DSH_HOME: options.dshHome },
      options.signal,
    )
    const handle = options.subprocess.spawn({
      argv: [executable, ...args],
      cwd: options.dshHome,
      env: { DSH_HOME: options.dshHome },
      graceMs: options.graceMs,
      signal: options.signal,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 65_536 },
        stderr: { maxBytes: 65_536 },
      },
    })
    const outcome = await handle.done
    if (outcome.exitCode !== 0) {
      throw new PluginDistributionError('ENT_PLUGIN_CLI_FAILED', 'dsh plugin command failed')
    }
  } catch (error) {
    throw distributionError(error, 'ENT_PLUGIN_CLI_FAILED', 'dsh plugin command failed')
  }
}

/** 通过官方 CLI 安装一个已验证绝对 tgz 路径。 */
export function installManagedPlugin(options: DshPluginCommandOptions, artifactPath: string): Promise<void> {
  return runDshPlugin(options, installPluginArguments(options.profile, artifactPath))
}

/** 通过官方 CLI 移除一个中心明确要求 ABSENT 的 package。 */
export function removeManagedPlugin(options: DshPluginCommandOptions, packageName: string): Promise<void> {
  return runDshPlugin(options, removePluginArguments(options.profile, packageName))
}
