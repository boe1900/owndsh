/**
 * [INPUT]: 依赖 DSH_HOME 下 OwnDsh 专用 skill 根目录、WorkBuddy frontmatter 和一个 provider 失效回调
 * [OUTPUT]: 提供全局 skill 的脱敏读取、按需制品校验/原子安装更新、启用/禁用、卸载及固定目录解析
 * [POS]: platform-client 的本地 skill 真相层；只接收平台已鉴权的制品字节，不直连 Server/GitLab，不扫描其他 Agent 目录，不把路径交给 Client
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { parse } from 'yaml'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import { resolveEnterpriseDshHome, type InstallationOptions } from './installation.js'
import { SkillArchiveError, unpackSkillArchive } from './skill-archive.js'

const SKILL_ROOT_RELATIVE = join('enterprise', 'skills')
const SKILL_MANIFEST_RELATIVE = join('enterprise', 'skill-manifest.json')
const MAX_SKILL_FILE_BYTES = 256 * 1024
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

export interface EnterpriseInstalledSkill {
  readonly name: string
  readonly displayName: string
  readonly description: string
  readonly category?: string
  readonly version: string
  readonly userInvocable: boolean
  readonly enabled: boolean
  readonly hasIcon: boolean
  readonly releaseId?: string
  readonly artifactSha256?: string
  readonly actions?: {
    readonly file: boolean
    readonly directory: boolean
  }
}

/** 当前目录中尚未落地的已发布 skill 元数据。 */
export interface EnterpriseAvailableSkill {
  readonly releaseId: string
  readonly name: string
  readonly displayName: string
  readonly description: string
  readonly category?: string
  readonly version: string
  readonly userInvocable: boolean
  readonly artifactSizeBytes: number
  readonly artifactSha256: string
  readonly hasIcon: false
  readonly updateAvailable: boolean
  readonly installedVersion?: string
}

export interface EnterpriseSkillRuntimeOptions extends Pick<InstallationOptions, 'dshHome' | 'env'> {
  /** Official filesystem provider invalidates its catalog through this callback. */
  readonly invalidate?: () => void
}

export type SkillArtifactDownload = (releaseId: string, signal: AbortSignal) => Promise<Uint8Array>

export interface EnterpriseCatalogSkill {
  readonly releaseId: string
  readonly metadata: {
    readonly name: string
    readonly version: string
    readonly description: string
    readonly license: string
    readonly author: string
    readonly userInvocable: boolean
    readonly modelInvocable: boolean
    readonly categories?: readonly string[] | undefined
  }
  readonly artifactSizeBytes: number
  readonly artifactSha256: string
}

interface SkillManifestEntry {
  readonly enabled: boolean
  readonly releaseId?: string
  readonly version?: string
  readonly artifactSha256?: string
}

interface SkillManifest {
  readonly version: 1
  readonly skills: Record<string, SkillManifestEntry>
}

interface SkillFrontmatter {
  readonly name: string
  readonly displayName: string
  readonly description: string
  readonly category?: string
  readonly version: string
  readonly userInvocable: boolean
}

export class EnterpriseSkillRuntimeError extends Error {
  constructor(readonly code: 'ENT_SKILL_NOT_FOUND' | 'ENT_SKILL_LOCAL_INVALID', message: string = code) {
    super(message)
    this.name = 'EnterpriseSkillRuntimeError'
  }
}

export function resolveEnterpriseSkillRoot(options: Pick<InstallationOptions, 'dshHome' | 'env'> = {}): string {
  return join(resolveEnterpriseDshHome(options), SKILL_ROOT_RELATIVE)
}

export function resolveEnterpriseSkillManifestPath(options: Pick<InstallationOptions, 'dshHome' | 'env'> = {}): string {
  return join(resolveEnterpriseDshHome(options), SKILL_MANIFEST_RELATIVE)
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const candidate = value[key]
  return typeof candidate === 'string' && candidate.trim() !== '' ? candidate.trim() : undefined
}

function parseFrontmatter(text: string, directoryName: string): SkillFrontmatter {
  if (Buffer.byteLength(text, 'utf8') > MAX_SKILL_FILE_BYTES) {
    throw new EnterpriseSkillRuntimeError('ENT_SKILL_LOCAL_INVALID', 'SKILL.md is too large')
  }
  const match = FRONTMATTER_PATTERN.exec(text)
  if (match === null) throw new EnterpriseSkillRuntimeError('ENT_SKILL_LOCAL_INVALID', 'SKILL.md frontmatter is missing')
  const frontmatter = match[1]
  if (frontmatter === undefined) throw new EnterpriseSkillRuntimeError('ENT_SKILL_LOCAL_INVALID', 'SKILL.md frontmatter is missing')
  let parsed: unknown
  try {
    parsed = parse(frontmatter)
  } catch {
    throw new EnterpriseSkillRuntimeError('ENT_SKILL_LOCAL_INVALID', 'SKILL.md frontmatter is invalid')
  }
  const fields = plainRecord(parsed)
  const name = fields === undefined ? undefined : stringField(fields, 'name')
  const description = fields === undefined ? undefined : stringField(fields, 'description')
    ?? (fields === undefined ? undefined : stringField(fields, 'description_zh'))
  if (fields === undefined || name === undefined || name !== directoryName || !isSkillName(name) || description === undefined) {
    throw new EnterpriseSkillRuntimeError('ENT_SKILL_LOCAL_INVALID', 'SKILL.md identity or description is invalid')
  }
  const userInvocable = fields['user-invocable']
  if (userInvocable !== undefined && typeof userInvocable !== 'boolean') {
    throw new EnterpriseSkillRuntimeError('ENT_SKILL_LOCAL_INVALID', 'user-invocable must be boolean')
  }
  const category = stringField(fields, 'category')
  return {
    name,
    displayName: stringField(fields, 'display_name') ?? name,
    description,
    ...(category === undefined ? {} : { category }),
    version: stringField(fields, 'version') ?? 'unknown',
    userInvocable: userInvocable ?? true,
  }
}

function parseManifest(value: unknown): SkillManifest {
  const source = plainRecord(value)
  if (source === undefined || source['version'] !== 1 || plainRecord(source['skills']) === undefined) {
    throw new EnterpriseSkillRuntimeError('ENT_SKILL_LOCAL_INVALID', 'skill manifest is invalid')
  }
  const skills: Record<string, SkillManifestEntry> = {}
  for (const [name, entry] of Object.entries(source['skills'] as Record<string, unknown>)) {
    if (!isSkillName(name)) throw new EnterpriseSkillRuntimeError('ENT_SKILL_LOCAL_INVALID', 'skill manifest name is invalid')
    const record = plainRecord(entry)
    if (record === undefined || typeof record['enabled'] !== 'boolean'
      || (record['releaseId'] !== undefined && (typeof record['releaseId'] !== 'string' || !/^\d+$/.test(record['releaseId'])))
      || (record['version'] !== undefined && typeof record['version'] !== 'string')
      || (record['artifactSha256'] !== undefined && (typeof record['artifactSha256'] !== 'string' || !/^[0-9a-f]{64}$/.test(record['artifactSha256'])))
      || Object.keys(record).some(key => !['enabled', 'releaseId', 'version', 'artifactSha256'].includes(key))) {
      throw new EnterpriseSkillRuntimeError('ENT_SKILL_LOCAL_INVALID', 'skill manifest entry is invalid')
    }
    skills[name] = {
      enabled: record['enabled'],
      ...(record['releaseId'] === undefined ? {} : { releaseId: record['releaseId'] }),
      ...(record['version'] === undefined ? {} : { version: record['version'] }),
      ...(record['artifactSha256'] === undefined ? {} : { artifactSha256: record['artifactSha256'] }),
    }
  }
  return { version: 1, skills }
}

async function readManifest(path: string): Promise<SkillManifest> {
  try {
    return parseManifest(JSON.parse(await readFile(path, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, skills: {} }
    if (error instanceof EnterpriseSkillRuntimeError) throw error
    throw new EnterpriseSkillRuntimeError('ENT_SKILL_LOCAL_INVALID', 'skill manifest cannot be read')
  }
}

async function writeManifest(path: string, manifest: SkillManifest): Promise<void> {
  await mkdir(dirname(path), { mode: 0o700, recursive: true })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

function inside(root: string, path: string): boolean {
  const relativePath = relative(root, path)
  return relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`))
}

/** OwnDsh 唯一允许写入和挂载给 DSH provider 的全局 skill 目录。 */
export class EnterpriseSkillRuntime {
  readonly #root: string
  readonly #manifestPath: string
  readonly #invalidate: () => void
  #queue: Promise<void> = Promise.resolve()

  constructor(options: EnterpriseSkillRuntimeOptions = {}) {
    this.#root = resolveEnterpriseSkillRoot(options)
    this.#manifestPath = resolveEnterpriseSkillManifestPath(options)
    this.#invalidate = options.invalidate ?? (() => undefined)
  }

  get root(): string { return this.#root }

  /** 动作入口重新确认 skill 仍是 OwnDsh 根下的完整副本。 */
  async assertInstalled(name: string): Promise<void> {
    await this.#exclusive(async () => {
      if (await this.#find(name) === undefined) throw new EnterpriseSkillRuntimeError('ENT_SKILL_NOT_FOUND')
    })
  }

  async readIcon(name: string): Promise<Uint8Array | undefined> {
    return this.#exclusive(async () => {
      if (await this.#find(name) === undefined) throw new EnterpriseSkillRuntimeError('ENT_SKILL_NOT_FOUND')
      const path = this.resolveFile(name, '_icon.png')
      const stat = await lstat(path).catch(() => undefined)
      if (stat?.isSymbolicLink()) throw new EnterpriseSkillRuntimeError('ENT_SKILL_LOCAL_INVALID', 'skill icon cannot be a symbolic link')
      if (stat === undefined || !stat.isFile()) return undefined
      return readFile(path)
    })
  }

  async list(): Promise<readonly EnterpriseInstalledSkill[]> {
    return this.#exclusive(() => this.#list())
  }

  /** 按用户选择把一个已发布 skill 原子安装到专用根；失败不影响已有副本。 */
  async install(
    skill: EnterpriseCatalogSkill,
    download: SkillArtifactDownload,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<void> {
    await this.#exclusive(async () => {
      signal.throwIfAborted()
      if (!isSkillName(skill.metadata.name)) throw new TypeError('skill name is invalid')
      const current = await this.#find(skill.metadata.name)
      if (current?.version === skill.metadata.version && current.artifactSha256 === skill.artifactSha256) return
      const bytes = await download(skill.releaseId, signal)
      await this.#installArchive(skill.metadata.name, skill.metadata.version, skill.artifactSha256,
        skill.artifactSizeBytes, bytes)
      const manifest = await readManifest(this.#manifestPath)
      await writeManifest(this.#manifestPath, {
        version: 1,
        skills: {
          ...manifest.skills,
          [skill.metadata.name]: {
            enabled: manifest.skills[skill.metadata.name]?.enabled ?? true,
            releaseId: skill.releaseId,
            version: skill.metadata.version,
            artifactSha256: skill.artifactSha256,
          },
        },
      })
      this.#invalidate()
    })
  }

  async #list(): Promise<readonly EnterpriseInstalledSkill[]> {
    const manifest = await readManifest(this.#manifestPath)
    let entries
    try { entries = await readdir(this.#root, { withFileTypes: true }) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw new EnterpriseSkillRuntimeError('ENT_SKILL_LOCAL_INVALID', 'skill root cannot be read')
    }
    const skills: EnterpriseInstalledSkill[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        if (entry.isSymbolicLink()) throw new EnterpriseSkillRuntimeError('ENT_SKILL_LOCAL_INVALID', 'skill root contains a symbolic link')
        continue
      }
      if (!isSkillName(entry.name)) continue
      const directory = this.#skillDirectory(entry.name)
      const instructionPath = join(directory, 'SKILL.md')
      const iconPath = join(directory, '_icon.png')
      const instructionStat = await lstat(instructionPath).catch(() => undefined)
      if (instructionStat === undefined || !instructionStat.isFile()) {
        throw new EnterpriseSkillRuntimeError('ENT_SKILL_LOCAL_INVALID', `skill ${entry.name} has no regular SKILL.md`)
      }
      const metadata = parseFrontmatter(await readFile(instructionPath, 'utf8'), entry.name)
      const iconStat = await lstat(iconPath).catch(() => undefined)
      if (iconStat?.isSymbolicLink()) throw new EnterpriseSkillRuntimeError('ENT_SKILL_LOCAL_INVALID', 'skill icon cannot be a symbolic link')
      const manifestEntry = manifest.skills[entry.name]
      skills.push({
        ...metadata,
        ...(manifestEntry?.version === undefined ? {} : { version: manifestEntry.version }),
        enabled: manifestEntry?.enabled ?? true,
        hasIcon: iconStat?.isFile() === true,
        ...(manifestEntry?.releaseId === undefined ? {} : { releaseId: manifestEntry.releaseId }),
        ...(manifestEntry?.artifactSha256 === undefined ? {} : { artifactSha256: manifestEntry.artifactSha256 }),
      })
    }
    return skills.sort((left, right) => left.displayName.localeCompare(right.displayName) || left.name.localeCompare(right.name))
  }

  async setEnabled(name: string, enabled: boolean): Promise<void> {
    await this.#exclusive(async () => {
      const skill = await this.#find(name)
      if (skill === undefined) throw new EnterpriseSkillRuntimeError('ENT_SKILL_NOT_FOUND')
      const manifest = await readManifest(this.#manifestPath)
      await writeManifest(this.#manifestPath, {
        version: 1,
        skills: { ...manifest.skills, [name]: { ...manifest.skills[name], enabled } },
      })
      this.#invalidate()
    })
  }

  async remove(name: string): Promise<void> {
    await this.#exclusive(async () => {
      const directory = this.#skillDirectory(name)
      const skill = await this.#find(name)
      if (skill === undefined) throw new EnterpriseSkillRuntimeError('ENT_SKILL_NOT_FOUND')
      const temporary = join(this.#root, `.${name}.removing-${randomUUID()}`)
      await rename(directory, temporary)
      try {
        const manifest = await readManifest(this.#manifestPath)
        const skills = { ...manifest.skills }
        delete skills[name]
        await writeManifest(this.#manifestPath, { version: 1, skills })
        await rm(temporary, { recursive: true, force: true })
      } catch (error) {
        await rename(temporary, directory).catch(() => undefined)
        throw error
      }
      this.#invalidate()
    })
  }

  async #installArchive(
    name: string,
    version: string,
    expectedSha256: string,
    expectedSize: number,
    bytes: Uint8Array,
  ): Promise<void> {
    if (bytes.byteLength !== expectedSize || createHash('sha256').update(bytes).digest('hex') !== expectedSha256) {
      throw new SkillArchiveError('skill artifact 长度或 SHA-256 不匹配')
    }
    const files = await unpackSkillArchive(bytes, name)
    const instruction = files.get('SKILL.md')
    if (instruction === undefined) throw new SkillArchiveError('skill ZIP 缺少 SKILL.md')
    const metadata = parseFrontmatter(new TextDecoder().decode(instruction), name)
    if (metadata.version !== 'unknown' && metadata.version !== version) throw new SkillArchiveError('skill version 与制品元数据不一致')
    await mkdir(this.#root, { mode: 0o700, recursive: true })
    const temporary = join(this.#root, `.${name}.incoming-${randomUUID()}`)
    await mkdir(temporary, { mode: 0o700 })
    try {
      for (const [path, content] of files) {
        const target = resolve(temporary, path)
        if (!inside(temporary, target) || target !== join(temporary, path)) throw new SkillArchiveError('skill ZIP 路径非法')
        await mkdir(dirname(target), { mode: 0o700, recursive: true })
        await writeFile(target, content, { flag: 'wx', mode: 0o600 })
      }
      const target = this.#skillDirectory(name)
      const backup = join(this.#root, `.${name}.backup-${randomUUID()}`)
      const existing = await lstat(target).catch(() => undefined)
      if (existing !== undefined) await rename(target, backup)
      try {
        await rename(temporary, target)
      } catch (error) {
        if (existing !== undefined) await rename(backup, target).catch(() => undefined)
        throw error
      }
      await rm(backup, { recursive: true, force: true })
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }

  async #removeUnlocked(name: string): Promise<void> {
    const directory = this.#skillDirectory(name)
    const temporary = join(this.#root, `.${name}.removing-${randomUUID()}`)
    await rename(directory, temporary)
    try {
      await rm(temporary, { recursive: true, force: true })
    } catch (error) {
      await rename(temporary, directory).catch(() => undefined)
      throw error
    }
  }

  /** Host 文件动作使用；不把返回值序列化到 Client API。 */
  resolveFile(name: string, fileName: 'SKILL.md' | '_icon.png' = 'SKILL.md'): string {
    const directory = this.#skillDirectory(name)
    const path = resolve(directory, fileName)
    if (!inside(this.#root, path) || path !== join(directory, fileName)) throw new EnterpriseSkillRuntimeError('ENT_SKILL_NOT_FOUND')
    return path
  }

  resolveDirectory(name: string): string {
    return this.#skillDirectory(name)
  }

  #skillDirectory(name: string): string {
    if (!isSkillName(name)) throw new EnterpriseSkillRuntimeError('ENT_SKILL_NOT_FOUND')
    const directory = resolve(this.#root, name)
    if (!inside(this.#root, directory)) throw new EnterpriseSkillRuntimeError('ENT_SKILL_NOT_FOUND')
    return directory
  }

  async #find(name: string): Promise<EnterpriseInstalledSkill | undefined> {
    return (await this.#list()).find(skill => skill.name === name)
  }

  async #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#queue
    let release!: () => void
    this.#queue = new Promise<void>(resolve => { release = resolve })
    await previous
    try { return await operation() } finally { release() }
  }
}
