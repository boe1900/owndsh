/**
 * [INPUT]: 依赖 EnterpriseSkillStore 和最小本地 API double
 * [OUTPUT]: 验证技能清单刷新、启用、卸载与 Host 文件动作串行边界
 * [POS]: dsh-ui 技能状态控制器回归，锁定动作只更新本地投影且错误不吞掉
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it, vi } from 'vitest'
import type { EnterpriseLocalApi } from '../src/local-api.js'
import { EnterpriseSkillStore } from '../src/skill-store.js'

const skill = { name: 'code-review', displayName: 'Code Review', description: 'Review', version: '1.0.0', userInvocable: true, enabled: true, hasIcon: false } as const
const availableSkill = { releaseId: '990', name: 'sample-skill', displayName: 'Sample Skill', description: 'Download media', version: '1.0.0', userInvocable: true, artifactSizeBytes: 1024, artifactSha256: 'a'.repeat(64), hasIcon: false, updateAvailable: false } as const

function api(overrides: Partial<EnterpriseLocalApi> = {}): EnterpriseLocalApi {
  return {
    status: vi.fn(), refresh: vi.fn(), setServerUrl: vi.fn(), bootstrap: vi.fn(), plugins: vi.fn(), startLogin: vi.fn(), cancelLogin: vi.fn(), logout: vi.fn(), uninstall: vi.fn(), mcpStatus: vi.fn(), startMcpOAuth: vi.fn(), mcpOAuthStatus: vi.fn(), cancelMcpOAuth: vi.fn(), connectMcp: vi.fn(), pauseMcp: vi.fn(), reconnectMcp: vi.fn(), disconnectMcp: vi.fn(),
    skills: vi.fn(async () => [skill]),
    availableSkills: vi.fn(async () => []),
    installSkill: vi.fn(async () => undefined),
    setSkillEnabled: vi.fn(async () => undefined),
    removeSkill: vi.fn(async () => undefined),
    openSkillFile: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as EnterpriseLocalApi
}

describe('EnterpriseSkillStore', () => {
  it('refreshes and applies device actions without mutating the source object', async () => {
    const local = api()
    const store = new EnterpriseSkillStore(local)
    expect(await store.refresh()).toBe(true)
    expect(store.getSnapshot().skills).toEqual([skill])
    expect(await store.setEnabled('code-review', false)).toBe(true)
    expect(local.setSkillEnabled).toHaveBeenCalledWith('code-review', false, expect.any(AbortSignal))
    expect(store.getSnapshot().skills[0]?.enabled).toBe(false)
    expect(await store.open('code-review', 'file')).toBe(true)
    expect(local.openSkillFile).toHaveBeenCalledWith('code-review', expect.any(AbortSignal))
    expect(await store.remove('code-review')).toBe(true)
    expect(store.getSnapshot().skills).toEqual([])
  })

  it('moves a published catalog skill from available to installed after installation', async () => {
    const local = api({
      skills: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([skill]),
      availableSkills: vi.fn()
        .mockResolvedValueOnce([availableSkill])
        .mockResolvedValueOnce([]),
    })
    const store = new EnterpriseSkillStore(local)
    expect(await store.refresh()).toBe(true)
    expect(store.getSnapshot().availableSkills).toEqual([availableSkill])
    expect(await store.install(availableSkill.name)).toBe(true)
    expect(local.installSkill).toHaveBeenCalledWith(availableSkill.name, expect.any(AbortSignal))
    expect(store.getSnapshot().skills).toEqual([skill])
    expect(store.getSnapshot().availableSkills).toEqual([])
  })

  it('keeps the exact skill action busy while installation is pending', async () => {
    let resolveInstall: (() => void) | undefined
    const local = api({
      availableSkills: vi.fn(async () => [availableSkill]),
      installSkill: vi.fn(() => new Promise<void>(resolve => { resolveInstall = resolve })),
    })
    const store = new EnterpriseSkillStore(local)
    await store.refresh()
    const pending = store.install(availableSkill.name)
    expect(store.getSnapshot().busy).toBe(`install:${availableSkill.name}`)
    resolveInstall?.()
    await pending
    expect(store.getSnapshot().busy).toBeUndefined()
  })

  it('keeps the catalog source authoritative after local uninstall', async () => {
    const local = api({
      availableSkills: vi.fn(async () => []),
    })
    const store = new EnterpriseSkillStore(local)
    expect(await store.refresh()).toBe(true)
    expect(await store.remove(skill.name)).toBe(true)
    expect(store.getSnapshot().skills).toEqual([])
    expect(store.getSnapshot().availableSkills).toEqual([])
  })
})
