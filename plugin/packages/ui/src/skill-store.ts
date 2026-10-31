/**
 * [INPUT]: 依赖同源 local-api 的已安装/可安装 skill 投影、设备级启用/安装/卸载动作和可取消请求
 * [OUTPUT]: 提供技能 Tab 的可安装/可更新/已安装 loading/ready/error snapshot、串行动作和刷新生命周期
 * [POS]: dsh-ui 的 skill 状态控制器；不解析 SKILL.md、不操作路径、不接触 Server 凭据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { EnterpriseAvailableSkill, EnterpriseInstalledSkill, EnterpriseLocalApi } from './local-api.js'
import { EnterpriseLocalApiError } from './local-api.js'

export type EnterpriseSkillAction = `toggle:${string}` | `remove:${string}` | `open:${string}:${'file' | 'directory'}`
  | `install:${string}`

export interface EnterpriseSkillSnapshot {
  readonly phase: 'loading' | 'ready' | 'error'
  readonly skills: readonly EnterpriseInstalledSkill[]
  readonly availableSkills: readonly EnterpriseAvailableSkill[]
  readonly busy?: EnterpriseSkillAction | undefined
  readonly errorCode?: string | undefined
}

function failureCode(error: unknown): string {
  return error instanceof EnterpriseLocalApiError ? error.code : 'ENT_LOCAL_UNAVAILABLE'
}

export class EnterpriseSkillStore {
  readonly #api: EnterpriseLocalApi
  readonly #listeners = new Set<() => void>()
  #snapshot: EnterpriseSkillSnapshot = { phase: 'loading', skills: [], availableSkills: [] }
  #request: AbortController | undefined
  #generation = 0

  constructor(api: EnterpriseLocalApi) { this.#api = api }

  readonly getSnapshot = (): EnterpriseSkillSnapshot => this.#snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    if (this.#listeners.size === 1) {
      void this.refresh()
    }
    return () => {
      this.#listeners.delete(listener)
      if (this.#listeners.size === 0) this.#request?.abort()
    }
  }

  async refresh(): Promise<boolean> {
    const load = this.#api.skills
    const loadAvailable = this.#api.availableSkills ?? (async () => [] as const)
    if (load === undefined) {
      this.#set({ ...this.#snapshot, phase: 'error', errorCode: 'ENT_SKILL_UNAVAILABLE' })
      return false
    }
    this.#request?.abort()
    const request = new AbortController()
    this.#request = request
    const generation = ++this.#generation
    this.#set({ ...this.#snapshot, phase: this.#snapshot.skills.length === 0 ? 'loading' : 'ready', errorCode: undefined })
    try {
      const [skills, availableSkills] = await Promise.all([load(request.signal), loadAvailable(request.signal)])
      if (request.signal.aborted || generation !== this.#generation) return false
      this.#set({ phase: 'ready', skills, availableSkills })
      return true
    } catch (error) {
      if (request.signal.aborted || generation !== this.#generation) return false
      this.#set({ ...this.#snapshot, phase: this.#snapshot.skills.length === 0 ? 'error' : 'ready', errorCode: failureCode(error) })
      return false
    } finally {
      if (this.#request === request) this.#request = undefined
    }
  }

  async setEnabled(name: string, enabled: boolean): Promise<boolean> {
    const action = this.#api.setSkillEnabled
    if (action === undefined || this.#snapshot.busy !== undefined) return false
    const current = this.#snapshot.skills.find(skill => skill.name === name)
    if (current === undefined) return false
    this.#set({ ...this.#snapshot, busy: `toggle:${name}`, errorCode: undefined })
    try {
      await action(name, enabled, new AbortController().signal)
      const next = this.#snapshot.skills.map(skill => skill.name === name ? { ...skill, enabled } : skill)
      this.#set({ ...this.#snapshot, skills: next, busy: undefined })
      return true
    } catch (error) {
      this.#set({ ...this.#snapshot, busy: undefined, errorCode: failureCode(error) })
      return false
    }
  }

  async remove(name: string): Promise<boolean> {
    const action = this.#api.removeSkill
    if (action === undefined || this.#snapshot.busy !== undefined) return false
    if (!this.#snapshot.skills.some(skill => skill.name === name)) return false
    this.#set({ ...this.#snapshot, busy: `remove:${name}`, errorCode: undefined })
    try {
      await action(name, new AbortController().signal)
      this.#set({ ...this.#snapshot, skills: this.#snapshot.skills.filter(skill => skill.name !== name), busy: undefined })
      await this.refresh()
      return true
    } catch (error) {
      this.#set({ ...this.#snapshot, busy: undefined, errorCode: failureCode(error) })
      return false
    }
  }

  async install(name: string): Promise<boolean> {
    const action = this.#api.installSkill
    if (action === undefined || this.#snapshot.busy !== undefined) return false
    if (!this.#snapshot.availableSkills.some(skill => skill.name === name)) return false
    this.#set({ ...this.#snapshot, busy: `install:${name}`, errorCode: undefined })
    try {
      await action(name, new AbortController().signal)
      return await this.refresh()
    } catch (error) {
      this.#set({ ...this.#snapshot, busy: undefined, errorCode: failureCode(error) })
      return false
    }
  }

  async open(name: string, target: 'file' | 'directory'): Promise<boolean> {
    const action = target === 'file' ? this.#api.openSkillFile : this.#api.openSkillDirectory
    if (action === undefined || this.#snapshot.busy !== undefined) return false
    if (!this.#snapshot.skills.some(skill => skill.name === name)) return false
    this.#set({ ...this.#snapshot, busy: `open:${name}:${target}`, errorCode: undefined })
    try {
      await action(name, new AbortController().signal)
      this.#set({ ...this.#snapshot, busy: undefined })
      return true
    } catch (error) {
      this.#set({ ...this.#snapshot, busy: undefined, errorCode: failureCode(error) })
      return false
    }
  }

  #set(snapshot: EnterpriseSkillSnapshot): void {
    this.#snapshot = snapshot
    for (const listener of this.#listeners) listener()
  }
}
