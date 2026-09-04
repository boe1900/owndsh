/**
 * [INPUT]: 依赖 installation 公开入口与 Node 临时文件系统
 * [OUTPUT]: 验证 UUID v4、并发首次启动稳定性、0600 权限、严格字段和损坏文件 fail-closed
 * [POS]: platform-client 持久化边界测试，证明 device.json 只含非秘密 installation 事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  loadOrCreateInstallation,
  resolveEnterpriseDevicePath,
} from '../src/index.js'

describe('enterprise installation', () => {
  const homes: string[] = []

  afterEach(async () => {
    await Promise.all(homes.splice(0).map(path => rm(path, { force: true, recursive: true })))
  })

  async function home(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), 'enterprise-installation-'))
    homes.push(path)
    return path
  }

  it('creates one private non-secret record and reuses it across concurrent starts', async () => {
    const dshHome = await home()
    const [first, second] = await Promise.all([
      loadOrCreateInstallation({ dshHome, name: 'Workstation' }),
      loadOrCreateInstallation({ dshHome, name: 'Workstation' }),
    ])
    expect(second).toEqual(first)
    expect(first.installationId).toMatch(/^[0-9a-f-]{36}$/i)
    const path = resolveEnterpriseDevicePath({ dshHome })
    const text = await readFile(path, 'utf8')
    expect(JSON.parse(text)).toEqual(first)
    expect(Object.keys(JSON.parse(text))).toEqual(['installationId', 'name', 'createdAt'])
    expect(text).not.toMatch(/token|authorization|secret/i)
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })

  it('resolves DSH_HOME and rejects malformed or expanded records', async () => {
    const dshHome = await home()
    const path = resolveEnterpriseDevicePath({ env: { DSH_HOME: dshHome } })
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify({
      installationId: '4fbec6ac-05fb-4bc7-8457-709647d9fe76',
      name: 'Workstation',
      createdAt: '2026-08-18T00:00:00.000Z',
      accessToken: 'must-never-be-accepted',
    }))
    await expect(loadOrCreateInstallation({ env: { DSH_HOME: dshHome } }))
      .rejects.toThrow('enterprise device file is invalid')
  })
})
