/**
 * [INPUT]: 依赖 Node Web Response 流、crypto/fs、公钥信任根、semver 与中心 RuntimePluginAssignment
 * [OUTPUT]: 对外提供流式下载、双重 hash/Ed25519 校验、compatibility 判定与冻结 JCS 声明
 * [POS]: plugin-distribution 的制品信任边界，只有完整验证的 tgz 才能原子进入 artifacts CAS
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash, createPublicKey, verify, type KeyObject } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { satisfies } from 'semver'
import { distributionError, PluginDistributionError } from './errors.js'
import type { EnterprisePlatformPort, RuntimePluginAssignment } from './types.js'

export interface ArtifactCompatibilityContext {
  readonly harnessCommit: string
  readonly bundleVersion: string
  readonly operatingSystem?: NodeJS.Platform
}

export interface DownloadArtifactOptions extends ArtifactCompatibilityContext {
  readonly platform: EnterprisePlatformPort
  readonly assignment: RuntimePluginAssignment
  readonly dshHome: string
  readonly trustedPublicKey: KeyObject
  readonly signal?: AbortSignal
}

function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/** 受限于签名 schema 的 RFC 8785 JSON；对象键递归排序，数值只允许安全有限整数。 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError('canonical signed numbers must be safe integers')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareUtf16(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalizeJson(item)}`)
      .join(',')}}`
  }
  throw new TypeError('canonical JSON contains an unsupported value')
}

export function signatureManifest(assignment: RuntimePluginAssignment): Record<string, unknown> {
  return {
    artifactId: assignment.pluginVersionId,
    packageName: assignment.packageName,
    version: assignment.version,
    sizeBytes: assignment.sizeBytes,
    sha256: assignment.sha256,
    compatibility: assignment.compatibility,
  }
}

/** 安装包信任根只接受 Ed25519 SPKI PEM 或其单行 DER Base64。 */
export function parseTrustedPluginPublicKey(value: string): KeyObject {
  try {
    const key = value.includes('-----BEGIN PUBLIC KEY-----')
      ? createPublicKey(value)
      : createPublicKey({ key: Buffer.from(value, 'base64'), format: 'der', type: 'spki' })
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519')
    return key
  } catch (error) {
    throw new PluginDistributionError(
      'ENT_PLUGIN_SIGNATURE_INVALID',
      'trusted plugin public key must be Ed25519 SPKI',
      { cause: error },
    )
  }
}

export function verifyAssignmentMetadata(
  assignment: RuntimePluginAssignment,
  trustedPublicKey: KeyObject,
  context: ArtifactCompatibilityContext,
): void {
  const compatibility = assignment.compatibility
  const operatingSystem = context.operatingSystem ?? process.platform
  if (!compatibility.harnessCommits.includes(context.harnessCommit)
    || !compatibility.operatingSystems.includes(operatingSystem as 'darwin' | 'linux' | 'win32')
    || !satisfies(context.bundleVersion, compatibility.enterpriseBundleRange, { includePrerelease: true })) {
    throw new PluginDistributionError('ENT_PLUGIN_INCOMPATIBLE', 'plugin assignment is incompatible with this runtime')
  }
  const signature = Buffer.from(assignment.signatureBase64, 'base64')
  const canonical = Buffer.from(canonicalizeJson(signatureManifest(assignment)), 'utf8')
  if (signature.length !== 64 || !verify(null, canonical, trustedPublicKey, signature)) {
    throw new PluginDistributionError('ENT_PLUGIN_SIGNATURE_INVALID', 'plugin assignment signature is invalid')
  }
}

async function hashFile(path: string): Promise<{ readonly bytes: number; readonly sha256: string }> {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of createReadStream(path)) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += data.byteLength
    hash.update(data)
  }
  return { bytes, sha256: hash.digest('hex') }
}

async function existingArtifact(path: string, assignment: RuntimePluginAssignment): Promise<boolean> {
  try {
    const info = await stat(path)
    if (!info.isFile() || info.size !== assignment.sizeBytes) return false
    const digest = await hashFile(path)
    return digest.bytes === assignment.sizeBytes && digest.sha256 === assignment.sha256
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/** 下载到固定 `.part`，校验全部信任事实后原子改名为 hash CAS 文件。 */
export async function downloadAndVerifyArtifact(options: DownloadArtifactOptions): Promise<string> {
  const { assignment } = options
  const directory = join(options.dshHome, 'enterprise', 'artifacts')
  const finalPath = join(directory, `${assignment.sha256}.tgz`)
  const partPath = `${finalPath}.part`
  await mkdir(directory, { recursive: true, mode: 0o700 })
  if (await existingArtifact(finalPath, assignment)) {
    verifyAssignmentMetadata(assignment, options.trustedPublicKey, options)
    return finalPath
  }
  await rm(finalPath, { force: true })
  await rm(partPath, { force: true })
  if (assignment.downloadUrl === null) {
    throw new PluginDistributionError('ENT_PLUGIN_DOWNLOAD_FAILED', 'installed assignment has no download URL')
  }

  let file: Awaited<ReturnType<typeof open>> | undefined
  try {
    const response = await options.platform.request(assignment.downloadUrl, {
      headers: { accept: 'application/octet-stream' },
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
    if (!response.ok || response.body === null) {
      throw new PluginDistributionError('ENT_PLUGIN_DOWNLOAD_FAILED', 'plugin download did not return a body')
    }
    const contentLength = response.headers.get('content-length')
    if (contentLength !== null && Number(contentLength) !== assignment.sizeBytes) {
      throw new PluginDistributionError('ENT_PLUGIN_SIZE_MISMATCH', 'plugin content length does not match assignment')
    }
    file = await open(partPath, 'wx', 0o600)
    const reader = response.body.getReader()
    const hash = createHash('sha256')
    let bytes = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > assignment.sizeBytes) {
          throw new PluginDistributionError('ENT_PLUGIN_SIZE_MISMATCH', 'plugin download exceeded assigned size')
        }
        hash.update(chunk.value)
        await file.write(chunk.value)
      }
    } finally {
      reader.releaseLock()
    }
    await file.sync()
    await file.close()
    file = undefined
    if (bytes !== assignment.sizeBytes) {
      throw new PluginDistributionError('ENT_PLUGIN_SIZE_MISMATCH', 'plugin download size does not match assignment')
    }
    if (hash.digest('hex') !== assignment.sha256) {
      throw new PluginDistributionError('ENT_PLUGIN_HASH_MISMATCH', 'plugin download hash does not match assignment')
    }
    verifyAssignmentMetadata(assignment, options.trustedPublicKey, options)
    await rename(partPath, finalPath)
    return finalPath
  } catch (error) {
    throw distributionError(error, 'ENT_PLUGIN_DOWNLOAD_FAILED', 'plugin download failed')
  } finally {
    await file?.close().catch(() => undefined)
    await rm(partPath, { force: true })
  }
}
