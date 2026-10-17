/**
 * [INPUT]: 依赖 EnterpriseSkillRuntime 的临时 DSH_HOME、WorkBuddy frontmatter 和本地文件操作
 * [OUTPUT]: 验证专用目录边界、脱敏清单、设备级开关、失效通知、原子卸载和坏 skill fail-closed
 * [POS]: platform-client D1 skill 运行时验收；证明 UI/API 不需要接触绝对路径或远端凭据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EnterpriseSkillRuntime,
  EnterpriseSkillRuntimeError,
  resolveEnterpriseSkillManifestPath,
  resolveEnterpriseSkillRoot,
} from '../src/index.js'

describe('enterprise skill runtime', () => {
  const homes: string[] = []

  afterEach(async () => {
    await Promise.all(homes.splice(0).map(path => rm(path, { force: true, recursive: true })))
  })

  async function home(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), 'enterprise-skills-'))
    homes.push(path)
    return path
  }

  async function skill(dshHome: string, name: string, extra = ''): Promise<void> {
    const directory = join(resolveEnterpriseSkillRoot({ dshHome }), name)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} description\ndisplay_name: ${name} display\nversion: 1.0.0\n${extra}---\n\nbody\n`)
  }

  function crc32(value: Uint8Array): number {
    let crc = 0xffffffff
    for (const byte of value) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0)
    }
    return (crc ^ 0xffffffff) >>> 0
  }

  function zipSkill(name: string, content: string): Uint8Array {
    const body = new TextEncoder().encode(content)
    const compressed = deflateRawSync(body)
    const path = new TextEncoder().encode(`${name}/SKILL.md`)
    const local = new Uint8Array(30 + path.length + compressed.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(6, 0, true)
    localView.setUint16(8, 8, true)
    localView.setUint16(26, path.length, true)
    localView.setUint16(28, 0, true)
    localView.setUint32(14, crc32(body), true)
    localView.setUint32(18, compressed.length, true)
    localView.setUint32(22, body.length, true)
    local.set(path, 30)
    local.set(compressed, 30 + path.length)
    const central = new Uint8Array(46 + path.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(8, 0, true)
    centralView.setUint16(10, 8, true)
    centralView.setUint32(16, crc32(body), true)
    centralView.setUint32(20, compressed.length, true)
    centralView.setUint32(24, body.length, true)
    centralView.setUint16(28, path.length, true)
    centralView.setUint32(42, 0, true)
    central.set(path, 46)
    const end = new Uint8Array(22)
    const endView = new DataView(end.buffer)
    endView.setUint32(0, 0x06054b50, true)
    endView.setUint16(8, 1, true)
    endView.setUint16(10, 1, true)
    endView.setUint32(12, central.length, true)
    endView.setUint32(16, local.length, true)
    return Uint8Array.from([...local, ...central, ...end])
  }

  it('lists only OwnDsh skills and defaults new local copies to enabled', async () => {
    const dshHome = await home()
    await skill(dshHome, 'code-review')
    await mkdir(join(dshHome, 'skills', 'external'), { recursive: true })
    await writeFile(join(dshHome, 'skills', 'external', 'SKILL.md'), '---\nname: external\ndescription: external\n---\n')
    const runtime = new EnterpriseSkillRuntime({ dshHome })

    expect(resolveEnterpriseSkillRoot({ dshHome })).toBe(join(dshHome, 'enterprise', 'skills'))
    expect(await runtime.list()).toEqual([{
      name: 'code-review', displayName: 'code-review display', description: 'code-review description',
      version: '1.0.0', userInvocable: true, enabled: true, hasIcon: false,
    }])
  })

  it('serializes device enablement and invalidates the official provider seam', async () => {
    const dshHome = await home()
    await skill(dshHome, 'code-review')
    const invalidate = vi.fn()
    const runtime = new EnterpriseSkillRuntime({ dshHome, invalidate })

    await runtime.setEnabled('code-review', false)
    await expect(runtime.list()).resolves.toMatchObject([{ name: 'code-review', enabled: false }])
    expect(invalidate).toHaveBeenCalledOnce()
    expect(JSON.parse(await readFile(resolveEnterpriseSkillManifestPath({ dshHome }), 'utf8'))).toEqual({
      version: 1, skills: { 'code-review': { enabled: false } },
    })

    await expect(Promise.all([
      runtime.setEnabled('code-review', true),
      runtime.setEnabled('code-review', false),
    ])).resolves.toEqual([undefined, undefined])
    await expect(runtime.list()).resolves.toMatchObject([{ name: 'code-review', enabled: false }])
  })

  it('removes one local copy atomically and leaves other skills intact', async () => {
    const dshHome = await home()
    await skill(dshHome, 'keep')
    await skill(dshHome, 'remove-me')
    const invalidate = vi.fn()
    const runtime = new EnterpriseSkillRuntime({ dshHome, invalidate })

    await runtime.remove('remove-me')
    await expect(runtime.list()).resolves.toMatchObject([{ name: 'keep' }])
    await expect(rm(join(resolveEnterpriseSkillRoot({ dshHome }), 'remove-me'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(invalidate).toHaveBeenCalledOnce()
  })

  it('rejects invalid metadata and symbolic links', async () => {
    const dshHome = await home()
    const root = resolveEnterpriseSkillRoot({ dshHome })
    await mkdir(root, { recursive: true })
    await mkdir(join(root, 'broken'), { recursive: true })
    await writeFile(join(root, 'broken', 'SKILL.md'), '---\nname: other\ndescription: broken\n---\n')
    const runtime = new EnterpriseSkillRuntime({ dshHome })
    await expect(runtime.list()).rejects.toMatchObject({ code: 'ENT_SKILL_LOCAL_INVALID' })

    await rm(join(root, 'broken'), { recursive: true })
    const outside = join(dshHome, 'outside')
    await mkdir(outside, { recursive: true })
    await symlink(outside, join(root, 'linked'))
    await expect(runtime.list()).rejects.toBeInstanceOf(EnterpriseSkillRuntimeError)

    await rm(join(root, 'linked'))
    await skill(dshHome, 'icon-link')
    await symlink(join(dshHome, 'outside'), join(root, 'icon-link', '_icon.png'))
    await expect(runtime.readIcon('icon-link')).rejects.toMatchObject({ code: 'ENT_SKILL_LOCAL_INVALID' })
  })

  it('downloads, verifies and atomically installs a selected catalog skill', async () => {
    const dshHome = await home()
    const invalidate = vi.fn()
    const runtime = new EnterpriseSkillRuntime({ dshHome, invalidate })
    const content = '---\nname: code-review\ndescription: Review code\nversion: 1.0.0\n---\n\nbody\n'
    const artifact = zipSkill('code-review', content)
    const sha256 = createHash('sha256').update(artifact).digest('hex')
    const skill = {
      releaseId: '990',
      metadata: { name: 'code-review', version: '1.0.0', description: 'Review code', license: 'MIT', author: 'OwnDsh', userInvocable: true, modelInvocable: true },
      artifactSizeBytes: artifact.byteLength,
      artifactSha256: sha256,
    }
    await expect(runtime.install(skill, async () => artifact)).resolves.toBeUndefined()
    await expect(runtime.list()).resolves.toMatchObject([{ name: 'code-review', version: '1.0.0', enabled: true }])
    expect(invalidate).toHaveBeenCalledOnce()

    await expect(runtime.install({ ...skill, artifactSha256: 'b'.repeat(64), metadata: { ...skill.metadata, version: '1.1.0' } }, async () => {
      throw new Error('offline')
    })).rejects.toThrow('offline')
    await expect(runtime.list()).resolves.toMatchObject([{ name: 'code-review', version: '1.0.0' }])

    await expect(runtime.install({ ...skill, artifactSha256: 'c'.repeat(64), metadata: { ...skill.metadata, version: '1.2.0' } }, async () => artifact))
      .rejects.toThrow('SHA-256')
    await expect(runtime.list()).resolves.toMatchObject([{ name: 'code-review', version: '1.0.0' }])
  })
})
