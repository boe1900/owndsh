/**
 * [INPUT]: 依赖 Node fs/os/path/crypto 在 DSH_HOME 下原子读写非秘密 installation 文件
 * [OUTPUT]: 对外提供 loadOrCreateInstallation、resolveEnterpriseDshHome、resolveEnterpriseDevicePath 与严格 InstallationRecord
 * [POS]: platform-client 的唯一持久化边界，只保存 UUID/显示名/创建时间而永不接触 Token
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { randomUUID } from 'node:crypto'
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, hostname } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const UUID_V4 = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$/

/** 单个 Harness installation 的非秘密持久身份。 */
export interface InstallationRecord {
  readonly installationId: string
  readonly name: string
  readonly createdAt: string
}

export interface InstallationOptions {
  readonly dshHome?: string
  readonly env?: NodeJS.ProcessEnv
  readonly name?: string
  readonly now?: () => Date
  readonly createId?: () => string
}

/** 按显式配置、DSH_HOME、用户目录的顺序解析唯一 Harness home。 */
export function resolveEnterpriseDshHome(options: Pick<InstallationOptions, 'dshHome' | 'env'> = {}): string {
  if (options.dshHome !== undefined && options.dshHome.trim() !== '') return resolve(options.dshHome)
  const configured = (options.env ?? process.env)['DSH_HOME']
  if (configured !== undefined && configured.trim() !== '') return resolve(configured)
  return join(homedir(), '.dsh')
}

/** 解析 platform-client 唯一的持久化路径。 */
export function resolveEnterpriseDevicePath(options: InstallationOptions = {}): string {
  return join(resolveEnterpriseDshHome(options), 'enterprise', 'device.json')
}

function parseInstallation(text: string): InstallationRecord {
  const value: unknown = JSON.parse(text)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('enterprise device file must contain an object')
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).sort().join(',') !== 'createdAt,installationId,name'
    || typeof record['installationId'] !== 'string' || !UUID_V4.test(record['installationId'])
    || typeof record['name'] !== 'string' || record['name'].length === 0 || record['name'].length > 120
    || typeof record['createdAt'] !== 'string' || !Number.isFinite(Date.parse(record['createdAt']))) {
    throw new TypeError('enterprise device file is invalid')
  }
  return {
    installationId: record['installationId'],
    name: record['name'],
    createdAt: record['createdAt'],
  }
}

/** 加载稳定 installation，或使用私有文件权限原子创建。 */
export async function loadOrCreateInstallation(
  options: InstallationOptions = {},
): Promise<InstallationRecord> {
  const path = resolveEnterpriseDevicePath(options)
  try {
    return parseInstallation(await readFile(path, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const record: InstallationRecord = {
    installationId: (options.createId ?? randomUUID)(),
    name: options.name ?? hostname(),
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
  }
  if (!UUID_V4.test(record.installationId) || record.name.length === 0 || record.name.length > 120) {
    throw new TypeError('generated enterprise installation is invalid')
  }
  await mkdir(dirname(path), { mode: 0o700, recursive: true })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    await link(temporary, path)
    await rm(temporary)
  } catch (error) {
    await rm(temporary, { force: true })
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return parseInstallation(await readFile(path, 'utf8'))
    }
    throw error
  }
  return record
}
