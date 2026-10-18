/**
 * [INPUT]: 依赖技能市场的本地/目录技能行和分类投影函数
 * [OUTPUT]: 验证全部视图合并、已安装覆盖和分类标签的稳定结果
 * [POS]: dsh-ui 技能市场纯数据投影回归；不启动 React 或 Host
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest'
import { mergeSkillRows, skillCategories, skillCategory, ALL_SKILLS_CATEGORY, UNCATEGORIZED_SKILLS_CATEGORY } from '../src/skill-market-filters.js'

const installed = { name: 'code-review', displayName: 'Code Review', description: 'Review', category: '开发工具', version: '1.0.0', userInvocable: true, enabled: true, hasIcon: false } as const
const available = { releaseId: '990', name: 'sample-skill', displayName: 'Sample Skill', description: 'Download media', version: '1.0.0', userInvocable: true, artifactSizeBytes: 1024, artifactSha256: 'a'.repeat(64), hasIcon: false } as const

describe('skill market projection', () => {
  it('merges available and installed rows with the local copy winning', () => {
    expect(mergeSkillRows([installed], [available, { ...available, name: installed.name, releaseId: '991' }])).toEqual([available, installed])
  })

  it('returns stable category filters and a visible fallback for uncategorized skills', () => {
    expect(skillCategory(available)).toBe(UNCATEGORIZED_SKILLS_CATEGORY)
    expect(skillCategories([available, installed])).toEqual(['开发工具', UNCATEGORIZED_SKILLS_CATEGORY])
    expect(ALL_SKILLS_CATEGORY).toBe('全部')
  })
})
