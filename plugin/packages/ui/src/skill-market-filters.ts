/**
 * [INPUT]: 依赖本地已安装与服务端可安装 Skill 的脱敏元数据
 * [OUTPUT]: 提供技能市场全部视图合并（含待更新版本）、分类归一化和稳定分类列表
 * [POS]: dsh-ui 技能市场的纯数据投影边界；不依赖 React、Host 或 UI primitives
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { EnterpriseAvailableSkill, EnterpriseInstalledSkill } from './local-api.js'

export type SkillMarketRow = EnterpriseInstalledSkill | EnterpriseAvailableSkill

export const ALL_SKILLS_CATEGORY = '全部'
export const UNCATEGORIZED_SKILLS_CATEGORY = '未分类'

export function mergeSkillRows(
  installed: readonly EnterpriseInstalledSkill[],
  available: readonly EnterpriseAvailableSkill[],
): readonly SkillMarketRow[] {
  const rows = new Map<string, SkillMarketRow>()
  for (const skill of available) rows.set(skill.name, skill)
  for (const skill of installed) {
    const existing = rows.get(skill.name)
    if (existing !== undefined && 'updateAvailable' in existing && existing.updateAvailable) continue
    rows.set(skill.name, skill)
  }
  return [...rows.values()]
}

export function skillCategory(skill: Pick<SkillMarketRow, 'category'>): string {
  return skill.category?.trim() || UNCATEGORIZED_SKILLS_CATEGORY
}

export function skillCategories(rows: readonly SkillMarketRow[]): readonly string[] {
  return [...new Set(rows.map(skillCategory))].sort((left, right) => left.localeCompare(right, 'zh-CN'))
}
