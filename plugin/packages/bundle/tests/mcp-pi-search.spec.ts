/**
 * [INPUT]: 依赖 Pi vendored MCP 检索与 exposure 纯逻辑。
 * [OUTPUT]: 验证英文 tokenizer、schema 文档、BM25 排名和曝光覆写优先级。
 * [POS]: bundle MCP 纯逻辑回归，不依赖 DSH transport 或 Agent 状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { describe, expect, it } from 'vitest'
import {
  Bm25Ranker,
  createToolSearchDocument,
  normalizeMcpExposure,
  resolveMcpToolExposure,
  tokenize,
} from '../src/mcp-pi-search.js'

describe('vendored Pi MCP search logic', () => {
  it('tokenizes English names and ranks schema metadata', () => {
    expect(tokenize('listIssues for GitHub_repo')).toEqual(['list', 'issue', 'git', 'hub', 'repo'])
    const documents = [
      createToolSearchDocument({
        name: 'mcp__github__list_issues',
        description: 'List issues',
        parameters: { properties: { state: { description: 'open or closed' } } },
      }, { name: 'GitHub', description: 'Issue tracker' }),
      createToolSearchDocument({ name: 'mcp__github__create_pull_request', description: 'Open a pull request' }),
    ]
    expect(new Bm25Ranker().rank('closed', documents, 8).map(match => match.name)).toEqual(['mcp__github__list_issues'])
    expect(documents[0]?.text).toContain('Issue tracker')
  })

  it('resolves exact overrides before wildcard and folds the legacy alias', () => {
    const config = {
      exposure: 'deferred' as const,
      toolExposure: { 'get_*': 'codemode' as const, get_me: 'direct' as const },
    }
    expect(resolveMcpToolExposure(config, 'get_me')).toBe('direct')
    expect(resolveMcpToolExposure(config, 'get_issue')).toBe('codemode')
    expect(resolveMcpToolExposure(config, 'list_issues')).toBe('deferred')
    expect(normalizeMcpExposure('codemode-deferred')).toBe('codemode')
  })
})
