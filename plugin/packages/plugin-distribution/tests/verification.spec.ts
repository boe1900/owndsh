/**
 * [INPUT]: 依赖 Node Ed25519/临时文件、可控 Response 流与 plugin-distribution 制品边界
 * [OUTPUT]: 验证 JCS 向量、流式成功、中断清理、hash、签名、compatibility 和缓存再验签
 * [POS]: plugin-distribution 的零 CLI 信任回归测试，确保失败制品永远停在激活边界之外
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canonicalizeJson,
  downloadAndVerifyArtifact,
  parseTrustedPluginPublicKey,
  signatureManifest,
  type EnterprisePlatformPort,
  type RuntimePluginAssignment,
} from '../src/index.js'

const HARNESS_COMMIT = '99f6f02fecdb7dff40c3fbc9470f5907c29f74ca'
const homes: string[] = []

afterEach(async () => {
  await Promise.all(homes.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

async function home(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'enterprise-plugin-verification-'))
  homes.push(path)
  return path
}

function platform(response: () => Response | Promise<Response>): EnterprisePlatformPort {
  return {
    status: () => ({
      state: 'READY', bundleVersion: '0.1.0', platformUrl: 'https://enterprise.invalid',
      transport: 'webServer.register',
    }),
    bootstrap: () => undefined,
    subscribe: () => () => undefined,
    request: vi.fn(async () => response()),
  }
}

function signedAssignment(
  content: Buffer,
  options: {
    readonly sha256?: string
    readonly signature?: Buffer
    readonly range?: string
    readonly operatingSystems?: ('darwin' | 'linux' | 'win32')[]
  } = {},
): { readonly assignment: RuntimePluginAssignment; readonly publicKey: string } {
  const pair = generateKeyPairSync('ed25519')
  const base: RuntimePluginAssignment = {
    pluginVersionId: '1901300000000000101',
    packageName: '@example/acme-tools',
    version: '1.2.3',
    sizeBytes: content.byteLength,
    sha256: options.sha256 ?? createHash('sha256').update(content).digest('hex'),
    signatureBase64: `${'A'.repeat(86)}==`,
    compatibility: {
      harnessCommits: [HARNESS_COMMIT],
      enterpriseBundleRange: options.range ?? '>=0.1.0 <0.2.0',
      operatingSystems: options.operatingSystems ?? ['darwin', 'linux', 'win32'],
    },
    downloadUrl: '/enterprise/api/v1/plugins/versions/1901300000000000101/download',
    required: true,
    desiredState: 'INSTALLED',
  }
  const signature = options.signature
    ?? sign(null, Buffer.from(canonicalizeJson(signatureManifest(base))), pair.privateKey)
  return {
    assignment: { ...base, signatureBase64: signature.toString('base64') },
    publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  }
}

describe('plugin artifact verification', () => {
  it('orders object keys by UTF-16 code units instead of locale collation', () => {
    expect(canonicalizeJson({ a: 2, Z: 1, '\u{1F600}': 4, '\uFFFD': 3 })).toBe(
      '{"Z":1,"a":2,"😀":4,"�":3}',
    )
  })

  it('matches the Server frozen RFC 8785 signature manifest vector', () => {
    const content = Buffer.alloc(4096)
    const { assignment } = signedAssignment(content, {
      sha256: '0123456789abcdef'.repeat(4),
      operatingSystems: ['darwin', 'linux'],
    })
    expect(canonicalizeJson(signatureManifest(assignment))).toBe(
      '{"artifactId":"1901300000000000101","compatibility":{"enterpriseBundleRange":">=0.1.0 <0.2.0",'
      + `"harnessCommits":["${HARNESS_COMMIT}"],"operatingSystems":["darwin","linux"]},`
      + '"packageName":"@example/acme-tools","sha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",'
      + '"sizeBytes":4096,"version":"1.2.3"}',
    )
  })

  it('streams a verified artifact into the hash-addressed final path and revalidates cache metadata', async () => {
    const content = Buffer.from('verified managed plugin tgz')
    const { assignment, publicKey } = signedAssignment(content)
    const request = vi.fn(async () => new Response(content, {
      headers: { 'content-length': String(content.byteLength) },
    }))
    const fake = platform(request)
    const dshHome = await home()
    const options = {
      platform: fake,
      assignment,
      dshHome,
      trustedPublicKey: parseTrustedPluginPublicKey(publicKey),
      harnessCommit: HARNESS_COMMIT,
      bundleVersion: '0.1.0',
      operatingSystem: process.platform,
    } as const
    const path = await downloadAndVerifyArtifact(options)
    expect(path).toBe(join(dshHome, 'enterprise', 'artifacts', `${assignment.sha256}.tgz`))
    await expect(readFile(path)).resolves.toEqual(content)
    await expect(stat(`${path}.part`)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(downloadAndVerifyArtifact(options)).resolves.toBe(path)
    expect(fake.request).toHaveBeenCalledOnce()
  })

  it.each([
    ['hash', { sha256: 'f'.repeat(64) }, 'ENT_PLUGIN_HASH_MISMATCH'],
    ['signature', { signature: Buffer.alloc(64) }, 'ENT_PLUGIN_SIGNATURE_INVALID'],
    ['bundle range', { range: '>=2.0.0' }, 'ENT_PLUGIN_INCOMPATIBLE'],
  ] as const)('rejects an invalid %s and deletes the part file', async (_name, change, code) => {
    const content = Buffer.from('untrusted plugin')
    const { assignment, publicKey } = signedAssignment(content, change)
    const dshHome = await home()
    await expect(downloadAndVerifyArtifact({
      platform: platform(() => new Response(content)),
      assignment,
      dshHome,
      trustedPublicKey: parseTrustedPluginPublicKey(publicKey),
      harnessCommit: HARNESS_COMMIT,
      bundleVersion: '0.1.0',
      operatingSystem: process.platform,
    })).rejects.toMatchObject({ code })
    const part = join(dshHome, 'enterprise', 'artifacts', `${assignment.sha256}.tgz.part`)
    await expect(stat(part)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes an interrupted partial download without producing a final artifact', async () => {
    const content = Buffer.from('four')
    const { assignment, publicKey } = signedAssignment(content)
    const interrupted = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(content.subarray(0, 2))
        controller.error(new Error('connection interrupted'))
      },
    })
    const dshHome = await home()
    await expect(downloadAndVerifyArtifact({
      platform: platform(() => new Response(interrupted)),
      assignment,
      dshHome,
      trustedPublicKey: parseTrustedPluginPublicKey(publicKey),
      harnessCommit: HARNESS_COMMIT,
      bundleVersion: '0.1.0',
      operatingSystem: process.platform,
    })).rejects.toMatchObject({ code: 'ENT_PLUGIN_DOWNLOAD_FAILED' })
    const base = join(dshHome, 'enterprise', 'artifacts', assignment.sha256)
    await expect(stat(`${base}.tgz.part`)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(`${base}.tgz`)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
