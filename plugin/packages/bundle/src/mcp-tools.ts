/**
 * [INPUT]: 依赖官方 ToolRuntime 注册表/guard、SystemPrompt assembly、TS/Python SDK renderer 与 runtime 的有效授权租约。
 * [OUTPUT]: 提供 mountMcpTools 与 MCP 连接代次，组合工具名称/简介目录、会话搜索、预算投影、撤销门禁与重新授权指引。
 * [POS]: bundle 的 MCP 呈现与执行边界；保持官方注册表和 preset 限制，只管理 OwnDsh 保留的 namespaces。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { isDeepStrictEqual } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, renderToolsSdk, renderToolsSdkPy, type ToolDefinition, type ToolExecution } from '@deepseek-ai/dsh-tools'
import type { AssembleContext } from '@deepseek-ai/dsh-system-prompt'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'

export interface McpConnection {
  readonly serverName: string
  readonly displayName: string
  readonly presentation: 'full' | 'search'
  readonly abort: AbortController
  expiresAt?: number
  ready: boolean
}

type SdkSchema = Parameters<typeof renderToolsSdk>[0][number]
type Entry = { connection: McpConnection; definition: ToolDefinition; schema: ToolSchema; sdk: SdkSchema; key: object }
const LIMITS = { tools: 16, bytes: 64 * 1024, definition: 16 * 1024, catalog: 512, catalogBytes: 1024 * 1024, result: 8 * 1024 }
const bytes = (value: unknown): number => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
const prefix = (serverName: string): string => `mcp__${serverName}__`
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

function terms(value: string): string[] {
  const normalized = value.replace(/([a-z])([A-Z])/g, '$1 $2').normalize('NFKC').toLowerCase()
  const parts = normalized.match(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu) ?? []
  return [...new Set(parts.flatMap(part => {
    const chars = Array.from(part)
    return /\p{Script=Han}/u.test(part) ? [part, ...chars.slice(1).map((char, i) => chars[i]! + char)] : [part]
  }))]
}

function bounded(value: unknown, depth = 0, count = { value: 0 }): boolean {
  if (depth > 32 || ++count.value > 4096) return false
  return typeof value !== 'object' || value === null || Object.values(value).every(item => bounded(item, depth + 1, count))
}

// ---- 同时计入 native 与较大的语言 SDK 增量，任何呈现模式都不会超过预算 ----
function fits(entries: Entry[]): boolean {
  if (entries.length > LIMITS.tools) return false
  const sdk = entries.map(item => item.sdk)
  return bytes(entries.map(item => item.schema)) + Math.max(
    bytes(renderToolsSdk(sdk)) - bytes(renderToolsSdk([])),
    bytes(renderToolsSdkPy(sdk)) - bytes(renderToolsSdkPy([])),
  ) <= LIMITS.bytes
}

export function mountMcpTools(ctx: Context, access: { fresh(): boolean; refresh(): Promise<void>; authorizationRequired?(): string[] }) {
  const connections = new Map<string, McpConnection>()
  const namespaces = new Set<string>()
  const hot = new WeakMap<object, Map<string, object>>()
  const executions = new WeakMap<object, Entry>()
  const dispatching = new Map<Readonly<ToolExecution>, { entry: Entry; abort: AbortController }>()
  let catalog = new Map<string, Entry>()
  let dirty = false
  let stopped = false
  const owned = (name: string): boolean => [...namespaces].some(value => name.startsWith(value))

  function rebuild(): void {
    dirty = false
    const next = new Map<string, Entry>()
    let size = 0
    for (const schema of ctx.tools.schemas().sort((a, b) => compare(a.name, b.name))) {
      const connection = [...connections.values()].find(value => schema.name.startsWith(prefix(value.serverName)))
      if (connection === undefined || !connection.ready || connection.abort.signal.aborted) continue
      const definition = ctx.tools.get(schema.name)!
      const sdk = { ...schema, output: definition.output.schema }
      if (!bounded(sdk)) continue
      const length = bytes(sdk)
      if (length > LIMITS.definition || next.size >= LIMITS.catalog || size + length > LIMITS.catalogBytes) continue
      size += length
      const previous = catalog.get(schema.name)
      next.set(schema.name, { connection, definition, schema, sdk,
        key: previous?.connection === connection && isDeepStrictEqual(previous.sdk, sdk) ? previous.key : {} })
    }
    catalog = next
  }

  function eligible(scope?: object): Entry[] {
    if (stopped || !access.fresh()) return []
    if (dirty) rebuild()
    return [...catalog.values()].filter(item => (item.connection.expiresAt === undefined || Date.now() < item.connection.expiresAt)
      && ctx.tools.get(item.schema.name, scope) === item.definition)
  }

  function full(entries: Entry[]): Entry[] {
    const candidates = entries.filter(item => item.connection.presentation === 'full')
    return fits(candidates) ? candidates : []
  }

  function selection(agent: object | undefined, entries: Entry[]): Entry[] {
    if (agent === undefined) return []
    const current = hot.get(agent)
    const selected = full(entries)
    if (current !== undefined) {
      for (const [name, key] of current) {
        if (!entries.some(item => item.schema.name === name && item.key === key)) current.delete(name)
      }
      for (const name of [...current.keys()].reverse()) {
        const item = entries.find(value => value.schema.name === name)!
        if (!selected.includes(item) && fits([...selected, item])) selected.push(item)
      }
    }
    return selected.sort((a, b) => compare(a.schema.name, b.schema.name))
  }

  function denial(exec: Readonly<ToolExecution>): string | undefined {
    if (!owned(exec.name)) return undefined
    if (stopped || !access.fresh()) return 'MCP_POLICY_STALE'
    if (access.authorizationRequired?.().some(name => exec.name.startsWith(prefix(name)))) {
      return 'MCP_AUTH_REQUIRED: 授权已失效，请到 OwnDsh 设置 → MCP 重新授权，完成后继续当前对话。'
    }
    if (dirty) return 'MCP_NOT_READY'
    const entry = catalog.get(exec.name)
    const captured = executions.get(exec)
    if (entry === undefined || captured?.key !== entry.key || captured.definition !== entry.definition
      || entry.connection.abort.signal.aborted) return 'MCP_GENERATION_CHANGED'
    return selection(exec.agent, eligible(exec.agent)).includes(entry) ? undefined : 'MCP_TOOL_NOT_LOADED: 请先调用 mcp_tool_search'
  }

  const search = ctx.tools.register(defineTool({
    name: 'mcp_tool_search',
    description: 'Search external MCP capabilities. Matching tools load for this conversation on the next inference. Return from run_code after searching; do not guess hidden tool names.',
    parameters: {
      query: { type: 'string', required: true, description: 'Search words, 1–256 characters' },
      serverName: { type: 'string', description: 'Optional exact MCP server name' },
      limit: { type: 'integer', description: 'Number of results, 1–8, default 5' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute({ query, serverName, limit = 5 }, exec) {
      // LLM 常把可选字符串参数生成为空字符串；其语义等同于未指定。
      const scopedServerName = serverName === '' ? undefined : serverName
      if (!query.trim() || query.length > 256 || !Number.isInteger(limit) || limit < 1 || limit > 8
        || (scopedServerName !== undefined && !/^[A-Za-z0-9_-]{1,32}$/.test(scopedServerName))) throw new Error('MCP_SEARCH_INVALID')
      const empty = (reason: string) => ({ matches: [], loadedNames: [], truncated: false, reason })
      if (exec.agent === undefined) return empty('AUTH_REQUIRED')
      await access.refresh()
      if (!access.fresh()) return empty('POLICY_STALE')
      const entries = eligible(exec.agent)
      const tokens = terms(query)
      const ranked = entries.filter(item => scopedServerName === undefined || item.connection.serverName === scopedServerName).map(item => {
        const name = item.schema.name.normalize('NFKC').toLowerCase()
        const server = `${item.connection.serverName} ${item.connection.displayName}`.normalize('NFKC').toLowerCase()
        const description = item.schema.description.normalize('NFKC').toLowerCase()
        const score = name === query.trim().normalize('NFKC').toLowerCase() ? 1000 : tokens.reduce((sum, token) =>
          sum + (name.includes(token) ? 3 : 0) + (server.includes(token) ? 2 : 0) + (description.includes(token) ? 1 : 0), 0)
        return { item, score }
      }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || compare(a.item.schema.name, b.item.schema.name))
      selection(exec.agent, entries)
      const current = new Map(hot.get(exec.agent))
      const matches: Array<{ name: string; description: string; serverName: string }> = []
      for (const { item } of ranked) {
        const trial = new Map(current)
        trial.delete(item.schema.name)
        trial.set(item.schema.name, item.key)
        const combined = () => [...new Set([...full(entries), ...entries.filter(value => trial.has(value.schema.name))])]
        while (!fits(combined())) {
          const oldest = [...trial.keys()].find(name => name !== item.schema.name && !matches.some(match => match.name === name))
          if (oldest === undefined) break
          trial.delete(oldest)
        }
        if (!fits(combined())) continue
        const match = { name: item.schema.name, description: Array.from(item.schema.description).slice(0, 220).join(''), serverName: item.connection.serverName }
        if (bytes({ matches: [...matches, match], loadedNames: [...matches.map(value => value.name), match.name], truncated: true }) > LIMITS.result) break
        current.clear()
        for (const [name, key] of trial) current.set(name, key)
        matches.push(match)
        if (matches.length === limit) break
      }
      hot.set(exec.agent, current)
      const authorizationRequired = (access.authorizationRequired?.() ?? []).filter(name => scopedServerName === undefined || name === scopedServerName).slice(0, 8)
      return { matches, loadedNames: matches.map(item => item.name), truncated: ranked.length > matches.length,
        ...(matches.length ? {} : { reason: ranked.length ? 'BUDGET_EXCEEDED' : authorizationRequired.length ? 'MCP_AUTH_REQUIRED' : 'NO_MATCH' }),
        ...(authorizationRequired.length ? { authorizationRequired, message: '这些服务需要在 OwnDsh 设置 → MCP 重新授权，完成后继续当前对话。' } : {}) }
    },
  }))
  const change = ctx.on('tools/change', () => {
    for (const [exec, call] of dispatching) {
      if (ctx.tools.get(exec.name, exec.agent) !== call.entry.definition) call.abort.abort()
    }
    if (dirty || stopped) return
    dirty = true
    queueMicrotask(() => { if (dirty && !stopped) rebuild() })
  })
  const pre = ctx.on('tools/pre-execute', async (exec, next) => {
    if (owned(exec.name)) {
      if (dirty) rebuild()
      const entry = catalog.get(exec.name)
      if (entry !== undefined) executions.set(exec, entry)
      await access.refresh()
    }
    return next()
  })
  const guard = ctx.tools.guard(denial)
  const dispatch = ctx.on('tools/execute', async (exec, next) => {
    if (!owned(exec.name)) return next()
    const reason = denial(exec)
    if (reason !== undefined) throw new Error(reason)
    const signal = exec.signal
    const entry = catalog.get(exec.name)!
    const abort = new AbortController()
    dispatching.set(exec, { entry, abort })
    exec.signal = AbortSignal.any([signal, entry.connection.abort.signal, abort.signal])
    try { return await next() } finally { dispatching.delete(exec); exec.signal = signal }
  })
  const result = ctx.on('tools/result', (exec, outcome) => {
    const current = exec.agent === undefined ? undefined : hot.get(exec.agent)
    const entry = catalog.get(exec.name)
    if (!outcome.isError && entry !== undefined && current?.get(exec.name) === entry.key) {
      current.delete(exec.name)
      current.set(exec.name, entry.key)
    }
  })
  const assemble = ctx.on('system-prompt/assemble', async (assembly, context: AssembleContext, next) => {
    if (dirty) rebuild()
    const before = new Map([...catalog].map(([name, entry]) => [name, entry.key]))
    const sdkBefore = ctx.tools.schemas(context.scope).filter(schema => schema.name !== 'run_code')
      .map(schema => ({ ...schema, output: ctx.tools.get(schema.name, context.scope)!.output.schema }))
    await access.refresh()
    const output = await next()
    const allowed = new Map(selection(context.agent, eligible(context.scope)).filter(item => before.get(item.schema.name) === item.key)
      .map(item => [item.schema.name, item]))
    output.tools = output.tools.filter(schema => !owned(schema.name)
      || (allowed.has(schema.name) && isDeepStrictEqual(schema, allowed.get(schema.name)!.schema)))
    const sdk = output.sections.filter(section => section.name === 'tools:sdk' && section.text !== '')
    if (sdk.length > 1) throw new Error('MCP_PRESENTATION_UNSUPPORTED')
    if (sdk[0] !== undefined) {
      const language = (ctx.get('codeRuntime') as { language?: string } | undefined)?.language
      const render = language === 'typescript' ? renderToolsSdk : language === 'python' ? renderToolsSdkPy : undefined
      if (render === undefined || sdk[0].text !== render(sdkBefore)) throw new Error('MCP_PRESENTATION_UNSUPPORTED')
      const schemas = ctx.tools.schemas(context.scope).filter(schema => schema.name !== 'run_code'
        && (!owned(schema.name) || allowed.has(schema.name)))
        .map(schema => ({ ...schema, output: ctx.tools.get(schema.name, context.scope)!.output.schema }))
      output.variables.owndsh_mcp_sdk = render(schemas)
      sdk[0].text = '{{owndsh_mcp_sdk}}'
    }
    return output
  })

  return {
    begin(serverName: string, displayName: string, presentation: 'full' | 'search'): McpConnection {
      const name = prefix(serverName)
      if (connections.has(serverName) || [...connections.keys()].some(value => name.startsWith(prefix(value)) || prefix(value).startsWith(name))
        || ctx.tools.schemas().some(schema => schema.name.startsWith(name))) throw new Error('MCP_NAMESPACE_CONFLICT')
      const connection = { serverName, displayName, presentation, ready: false, abort: new AbortController() }
      namespaces.add(name)
      connections.set(serverName, connection)
      return connection
    },
    ready(connection: McpConnection): void {
      if (stopped || connections.get(connection.serverName) !== connection) return
      connection.ready = true
      rebuild()
    },
    revoke(connection: McpConnection): void {
      connection.abort.abort()
      if (connections.get(connection.serverName) === connection) connections.delete(connection.serverName)
      rebuild()
    },
    status(serverName: string) {
      if (dirty) rebuild()
      const entries = eligible()
      const requestedFull = connections.get(serverName)?.presentation === 'full'
      const overBudget = requestedFull && !fits(entries.filter(item => item.connection.presentation === 'full'))
      const tools = entries.filter(item => item.connection.serverName === serverName).map(item => ({
        name: item.schema.name.slice(prefix(serverName).length),
        description: item.schema.description,
      }))
      return { discoveredToolCount: tools.length, tools,
        effectivePresentation: requestedFull && !overBudget ? 'full' as const : 'search' as const,
        ...(overBudget ? { errorCode: 'MCP_BUDGET_EXCEEDED' } : {}) }
    },
    dispose(): void {
      stopped = true
      for (const call of dispatching.values()) call.abort.abort()
      for (const connection of connections.values()) connection.abort.abort()
      connections.clear()
      catalog.clear()
      for (const dispose of [assemble, result, dispatch, guard, pre, change, search]) dispose()
    },
  }
}
