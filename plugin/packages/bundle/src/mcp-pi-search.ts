/**
 * [INPUT]: 依赖 MCP 工具名称、英文描述、输入 schema 与 OwnDsh 的服务器/工具曝光配置。
 * [OUTPUT]: 提供 Pi vendored 的英文 tokenizer、schema 文档构造、BM25 排名与工具曝光解析。
 * [POS]: bundle 的 MCP 纯逻辑层；不依赖 Pi Agent、active set、loadout、Codemode 或传输运行时。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

/*
 * Vendored from https://github.com/earendil-works/pi
 * Upstream commit: 3dd803d7e780fb04b815261b510f76bff563d46d
 * Source: packages/coding-agent/src/extensions/tool-search/tool.ts and
 *         packages/coding-agent/src/core/mcp-servers.ts
 *
 * MIT License
 * Copyright (c) 2025 Mario Zechner
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export interface ToolSearchDocument {
  name: string
  text: string
}

export interface ToolSearchMatch {
  name: string
  score: number
}

export interface ToolRanker {
  rank(query: string, documents: readonly ToolSearchDocument[], limit: number): ToolSearchMatch[]
}

export interface ToolSearchInput {
  readonly name: string
  readonly description?: string
  readonly parameters?: unknown
}

export interface ToolSearchNamespace {
  readonly name: string
  readonly description?: string | undefined
}

const STOP_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with',
])

/** Naive singular form, so `issues` matches `issue` and `searches` matches `search`. */
function stem(term: string): string {
  if (term.length > 4 && term.endsWith('ies')) return `${term.slice(0, -3)}y`
  if (term.length > 4 && /(ches|shes|sses|xes|zes)$/.test(term)) return term.slice(0, -2)
  if (term.length > 3 && term.endsWith('s') && !term.endsWith('ss')) return term.slice(0, -1)
  return term
}

/** Lowercase terms, split at camelCase boundaries and non-alphanumerics, without stop words. */
export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(term => term.length > 0 && !STOP_WORDS.has(term))
    .map(stem)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Schema descriptions and property names, recursively. */
export function schemaText(schema: unknown, parts: string[]): void {
  if (!isObject(schema)) return
  if (typeof schema.description === 'string') parts.push(schema.description)
  if (isObject(schema.properties)) {
    for (const [name, property] of Object.entries(schema.properties)) {
      parts.push(name)
      schemaText(property, parts)
    }
  }
  schemaText(schema.items, parts)
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    const variants = schema[key]
    if (Array.isArray(variants)) for (const variant of variants) schemaText(variant, parts)
  }
}

/** Build the same search text Pi uses for a tool and its namespace. */
export function createToolSearchDocument(tool: ToolSearchInput, namespace?: ToolSearchNamespace): ToolSearchDocument {
  const parts = [tool.name, tool.name.replaceAll('_', ' '), tool.description ?? '']
  schemaText(tool.parameters, parts)
  if (namespace) parts.push(namespace.name, namespace.description ?? '')
  return { name: tool.name, text: parts.filter(part => part.trim()).join(' ') }
}

/** Okapi BM25 with Pi's defaults. Ties keep document order. */
export class Bm25Ranker implements ToolRanker {
  private readonly k1: number
  private readonly b: number

  constructor(options: { k1?: number; b?: number } = {}) {
    this.k1 = options.k1 ?? 1.2
    this.b = options.b ?? 0.75
  }

  rank(query: string, documents: readonly ToolSearchDocument[], limit: number): ToolSearchMatch[] {
    const queryTerms = [...new Set(tokenize(query))]
    if (queryTerms.length === 0 || documents.length === 0 || limit <= 0) return []
    const termCounts = documents.map(document => {
      const counts = new Map<string, number>()
      for (const term of tokenize(document.text)) counts.set(term, (counts.get(term) ?? 0) + 1)
      return counts
    })
    const lengths = termCounts.map(counts => [...counts.values()].reduce((sum, count) => sum + count, 0))
    const averageLength = lengths.reduce((sum, length) => sum + length, 0) / documents.length || 1
    const idf = new Map(queryTerms.map(term => {
      const frequency = termCounts.filter(counts => counts.has(term)).length
      return [term, Math.log(1 + (documents.length - frequency + 0.5) / (frequency + 0.5))] as const
    }))
    const matches: ToolSearchMatch[] = []
    documents.forEach((document, index) => {
      let score = 0
      for (const term of queryTerms) {
        const count = termCounts[index]!.get(term)
        if (!count) continue
        const norm = this.k1 * (1 - this.b + (this.b * lengths[index]!) / averageLength)
        score += (idf.get(term) ?? 0) * ((count * (this.k1 + 1)) / (count + norm))
      }
      if (score > 0) matches.push({ name: document.name, score })
    })
    return matches.sort((a, b) => b.score - a.score).slice(0, limit)
  }
}

/** OwnDsh runtime exposure modes projected from Pi's five MCP exposure intents. */
export type McpExposure = 'codemode' | 'deferred' | 'direct' | 'hidden'

/** Pi's fifth MCP intent is accepted as a compatibility input and projected to codemode. */
export type McpExposureInput = McpExposure | 'codemode-deferred'

export interface McpExposureConfig {
  readonly exposure?: McpExposureInput | undefined
  readonly toolExposure?: Readonly<Record<string, McpExposureInput>> | undefined
}

export function normalizeMcpExposure(exposure: McpExposureInput | undefined): McpExposure | undefined {
  return exposure === 'codemode-deferred' ? 'codemode' : exposure
}

function toolPatternRegExp(pattern: string): RegExp {
  const source = pattern
    .split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${source}$`)
}

/** Resolve exact tool override, then the first wildcard, then the server default. */
function resolveMcpToolExposureWithFallback(
  config: McpExposureConfig,
  toolName: string,
  fallback: McpExposure | undefined,
): McpExposure | undefined {
  const overrides = config.toolExposure ?? {}
  const exact = overrides[toolName]
  if (exact !== undefined) return normalizeMcpExposure(exact) ?? fallback
  for (const [pattern, exposure] of Object.entries(overrides)) {
    if (pattern.includes('*') && toolPatternRegExp(pattern).test(toolName)) return normalizeMcpExposure(exposure) ?? fallback
  }
  return normalizeMcpExposure(config.exposure) ?? fallback
}

/** Resolve one tool, using Pi's codemode default when no setting exists. */
export function resolveMcpToolExposure(config: McpExposureConfig, toolName: string): McpExposure {
  return resolveMcpToolExposureWithFallback(config, toolName, 'codemode') ?? 'codemode'
}

/** Resolve one tool while retaining an omitted server default for per-Agent projection. */
export function resolveMcpToolExposureOptional(config: McpExposureConfig, toolName: string): McpExposure | undefined {
  return resolveMcpToolExposureWithFallback(config, toolName, undefined)
}
