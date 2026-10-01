/**
 * [INPUT]: 依赖官方 ToolRuntime 注册表/guard、SystemPrompt assembly、TS/Python SDK renderer、Pi vendored 检索纯逻辑与 runtime 的有效授权租约。
 * [OUTPUT]: 提供 mountMcpTools 与 MCP 连接代次，按工具曝光档维护发现目录、下一轮选择状态、本步声明快照和执行守卫。
 * [POS]: bundle 的 MCP 呈现与执行边界；保持官方注册表和 DSH 模式，只管理 OwnDsh 保留的 namespaces。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, renderToolsSdk, renderToolsSdkPy, type ToolDefinition, type ToolExecution } from '@deepseek-ai/dsh-tools'
import type { AssembleContext } from '@deepseek-ai/dsh-system-prompt'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import {
  Bm25Ranker,
  createToolSearchDocument,
  normalizeMcpExposure,
  resolveMcpToolExposureOptional,
  type McpExposure,
  type McpExposureConfig,
  type McpExposureInput,
} from './mcp-pi-search.js'

export type { McpExposure, McpExposureConfig, McpExposureInput } from './mcp-pi-search.js'

export interface McpConnection {
  readonly serverName: string
  readonly displayName: string
  description?: string | undefined
  instructions?: string | undefined
  readonly exposure?: McpExposureInput
  readonly toolExposure?: Readonly<Record<string, McpExposureInput>>
  /** Public DSH names mapped to the MCP server's raw names for config matching. */
  rawToolNames?: ReadonlyMap<string, string>
  readonly abort: AbortController
  expiresAt?: number
  ready: boolean
}

type ExposureConfig = McpExposureConfig
type SdkSchema = Parameters<typeof renderToolsSdk>[0][number]
type Entry = {
  connection: McpConnection
  definition: ToolDefinition
  schema: ToolSchema
  sdk: SdkSchema
  key: object
  /** Explicit server/tool setting; undefined is resolved per Agent mode. */
  exposure: McpExposure | undefined
}

const LIMITS = { definition: 16 * 1024, catalog: 512, catalogBytes: 1024 * 1024, result: 8 * 1024 }
const bytes = (value: unknown): number => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
const prefix = (serverName: string): string => `mcp__${serverName}__`
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
const isSearchable = (exposure: McpExposure): boolean => exposure === 'codemode' || exposure === 'deferred'

function bounded(value: unknown, depth = 0, count = { value: 0 }): boolean {
  if (depth > 32 || ++count.value > 4096) return false
  return typeof value !== 'object' || value === null || Object.values(value).every(item => bounded(item, depth + 1, count))
}

/** 复用 DSH 的确定性命名契约，只做正向转换，绝不从公开名猜原始名。 */
export function publicMcpToolName(serverName: string, rawName: string): string {
  const joined = `${prefix(serverName)}${rawName}`
  const normalized = joined.replace(/[^A-Za-z0-9_-]/g, '_')
  if (normalized === joined && normalized.length <= 64) return normalized
  const hash = createHash('sha256').update(`${serverName}\0${rawName}`).digest('hex').slice(0, 12)
  return `${normalized.slice(0, 51)}_${hash}`
}

type DshMode = 'native' | 'ptc' | 'both'

export function mountMcpTools(ctx: Context, access: { fresh(): boolean; refresh(): Promise<void>; authorizationRequired?(): string[] }) {
  const connections = new Map<string, McpConnection>()
  const namespaces = new Set<string>()
  // Selection is intentionally local to each live Agent and applies at next assembly.
  const selected = new WeakMap<object, Map<string, object>>()
  const nativePresented = new WeakMap<object, Map<string, object>>()
  const modes = new WeakMap<object, DshMode>()
  const executions = new WeakMap<object, Entry>()
  const codeExecutions = new Map<ToolExecution['token'], Readonly<ToolExecution>>()
  const dispatching = new Map<Readonly<ToolExecution>, { entry: Entry; abort: AbortController }>()
  let catalog = new Map<string, Entry>()
  let dirty = false
  let stopped = false
  const owned = (name: string): boolean => [...namespaces].some(value => name.startsWith(value))

  const fallbackMode = (): DshMode => ctx.get('ptcRuntime') === undefined ? 'native' : 'ptc'

  function defaultExposure(): McpExposure {
    return fallbackMode() === 'native' ? 'deferred' : 'codemode'
  }

  function config(connection: McpConnection): ExposureConfig {
    return {
      ...(connection.exposure === undefined ? {} : { exposure: connection.exposure }),
      ...(connection.toolExposure === undefined ? {} : { toolExposure: connection.toolExposure }),
    }
  }

  function effectiveExposure(item: Entry, mode: DshMode): McpExposure {
    return item.exposure ?? (mode === 'native' ? 'deferred' : 'codemode')
  }

  function configuredExposure(connection: McpConnection, publicName: string): McpExposure | undefined {
    const rawName = connection.rawToolNames?.get(publicName)
    if (rawName !== undefined) return resolveMcpToolExposureOptional(config(connection), rawName)
    // 官方 client 未公开原始名元数据时，精确覆写可正向生成公开名；通配符仅对无损名字解析。
    const exact = Object.entries(connection.toolExposure ?? {}).find(([name]) => !name.includes('*')
      && publicMcpToolName(connection.serverName, name) === publicName)
    if (exact !== undefined) return normalizeMcpExposure(exact[1])
    return resolveMcpToolExposureOptional(config(connection), publicName.slice(prefix(connection.serverName).length))
  }

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
      const exposure = configuredExposure(connection, schema.name)
      const previous = catalog.get(schema.name)
      next.set(schema.name, {
        connection,
        definition,
        schema,
        sdk,
        key: previous?.connection === connection && previous.definition === definition
          && previous.exposure === exposure && isDeepStrictEqual(previous.sdk, sdk) ? previous.key : {},
        exposure,
      })
    }
    catalog = next
  }

  function eligible(scope?: object): Entry[] {
    if (stopped || !access.fresh()) return []
    if (dirty) rebuild()
    return [...catalog.values()].filter(item => (item.connection.expiresAt === undefined || Date.now() < item.connection.expiresAt)
      && ctx.tools.get(item.schema.name, scope) === item.definition)
  }

  function isSelected(agent: object, item: Entry): boolean {
    return selected.get(agent)?.get(item.schema.name) === item.key
  }

  function selection(agent: object | undefined, entries: Entry[], mode: DshMode): Entry[] {
    if (agent === undefined) return []
    const current = selected.get(agent)
    for (const [name, key] of current ?? []) {
      const item = entries.find(value => value.schema.name === name)
      if (item === undefined || item.key !== key || !isSearchable(effectiveExposure(item, mode))) current?.delete(name)
    }
    return entries.filter(item => effectiveExposure(item, mode) === 'direct' || isSelected(agent, item))
      .sort((a, b) => compare(a.schema.name, b.schema.name))
  }

  function project(items: Entry[], mode: DshMode, surface: 'native' | 'sdk'): Entry[] {
    return items.filter(item => {
      const exposure = effectiveExposure(item, mode)
      if (exposure === 'hidden') return false
      if (surface === 'native') return exposure === 'direct' || exposure === 'deferred'
      if (mode === 'native') return false
      return true
    })
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
    const mode = exec.agent === undefined ? fallbackMode() : modes.get(exec.agent) ?? fallbackMode()
    if (effectiveExposure(entry, mode) === 'hidden') return 'MCP_GENERATION_CHANGED'
    if (!eligible(exec.agent).includes(entry)) return 'MCP_GENERATION_CHANGED'
    // 只有同一 Agent 正在执行的 run_code token 才代表 PTC；任意嵌套调用不能绕过原生声明快照。
    const parent = exec.parent === undefined ? undefined : codeExecutions.get(exec.parent)
    if (parent !== undefined && parent.agent === exec.agent && mode !== 'native') return undefined
    const visible = exec.agent === undefined ? undefined : nativePresented.get(exec.agent)
    return visible?.get(exec.name) === entry.key
      ? undefined : 'MCP_TOOL_NOT_LOADED: 请先调用 tool_search，并在下一步推理时调用工具'
  }

  if (ctx.tools.get('tool_search') !== undefined) throw new Error('MCP_NAMESPACE_CONFLICT')
  const search = ctx.tools.register(defineTool({
    name: 'tool_search',
    description: 'Search deferred MCP capabilities with BM25. Matching tools become available on the next inference. Search only tools needed for the task; return from run_code after searching.',
    parameters: {
      query: { type: 'string', required: true, description: 'English search query for deferred tools.' },
      limit: { type: 'integer', description: 'Maximum number of tools to return. Defaults to 8.' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute({ query, limit = 8 }, exec) {
      if (typeof query !== 'string' || query.trim() === '' || !Number.isInteger(limit) || limit <= 0 || limit > 8) {
        throw new Error('MCP_SEARCH_INVALID')
      }
      if (exec.agent === undefined) return { loaded: [], matches: [], reason: 'AUTH_REQUIRED' }
      await access.refresh()
      if (!access.fresh()) return { loaded: [], matches: [], reason: 'POLICY_STALE' }
      const entries = eligible(exec.agent)
      const mode = modes.get(exec.agent) ?? fallbackMode()
      const current = selected.get(exec.agent)
      const candidates = entries.filter(item => {
        const itemExposure = effectiveExposure(item, mode)
        return isSearchable(itemExposure)
        && (itemExposure !== 'codemode' || mode !== 'native')
        && current?.get(item.schema.name) !== item.key
      })
      const documents = candidates.map(item => createToolSearchDocument({
        name: item.schema.name,
        description: item.schema.description,
        parameters: item.schema.parameters,
      }, {
        name: item.connection.displayName,
        description: item.connection.description,
      }))
      const ranked = new Bm25Ranker().rank(query, documents, limit)
      const next = new Map(current)
      const matches: Array<{ name: string; description: string }> = []
      for (const match of ranked) {
        const item = candidates.find(value => value.schema.name === match.name)
        if (item === undefined) continue
        const result = { name: item.schema.name, description: item.schema.description.trim().split(/\r?\n/)[0] ?? '' }
        if (bytes({ matches: [...matches, result], loaded: [...matches.map(value => value.name), result.name] }) > LIMITS.result) break
        next.set(item.schema.name, item.key)
        matches.push(result)
      }
      selected.set(exec.agent, next)
      const authorizationRequired = (access.authorizationRequired?.() ?? []).slice(0, 8)
      return {
        loaded: matches.map(item => item.name),
        matches,
        truncated: ranked.length > matches.length,
        ...(matches.length ? {} : {
          reason: authorizationRequired.length
            ? 'MCP_AUTH_REQUIRED'
            : entries.some(item => effectiveExposure(item, mode) === 'codemode') && mode === 'native'
              ? 'MCP_CODEMODE_UNAVAILABLE'
              : 'NO_MATCH',
        }),
        ...(authorizationRequired.length ? { authorizationRequired } : {}),
      }
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
    if (exec.name === 'run_code') {
      codeExecutions.set(exec.token, exec)
      try { return await next() } finally { codeExecutions.delete(exec.token) }
    }
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
  const assemble = ctx.on('system-prompt/assemble', async (assembly, context: AssembleContext, next) => {
    if (dirty) rebuild()
    const before = new Map([...catalog].map(([name, entry]) => [name, entry.key]))
    const sdkBefore = ctx.tools.schemas(context.scope).filter(schema => schema.name !== 'run_code')
      .map(schema => ({ ...schema, output: ctx.tools.get(schema.name, context.scope)!.output.schema }))
    await access.refresh()
    const output = await next()
    const sdk = output.sections.filter(section => section.name === 'tools:sdk' && section.text !== '')
    if (sdk.length > 1) throw new Error('MCP_PRESENTATION_UNSUPPORTED')
    const hasPtc = sdk[0] !== undefined
    const hasNativeMcp = output.tools.some(schema => owned(schema.name))
    const mode: DshMode = hasPtc ? hasNativeMcp ? 'both' : 'ptc' : 'native'
    if (context.agent !== undefined) modes.set(context.agent, mode)
    const entries = eligible(context.scope)
    const selectedEntries = selection(context.agent, entries, mode).filter(item => before.get(item.schema.name) === item.key)
    const nativeAllowed = new Map(project(selectedEntries, mode, 'native').map(item => [item.schema.name, item]))
    const sdkAllowed = new Map(project(selectedEntries, mode, 'sdk').map(item => [item.schema.name, item]))
    output.tools = output.tools.filter(schema => !owned(schema.name)
      || (nativeAllowed.has(schema.name) && isDeepStrictEqual(schema, nativeAllowed.get(schema.name)!.schema)))
    const visible = new Set(output.tools.map(schema => schema.name))
    if (sdk[0] !== undefined) {
      const language = (ctx.get('ptcRuntime') as { language?: string } | undefined)?.language
      const render = language === 'typescript' ? renderToolsSdk : language === 'python' ? renderToolsSdkPy : undefined
      if (render === undefined || sdk[0].text !== render(sdkBefore)) throw new Error('MCP_PRESENTATION_UNSUPPORTED')
      const schemas = ctx.tools.schemas(context.scope).filter(schema => schema.name !== 'run_code'
        && (!owned(schema.name) || sdkAllowed.has(schema.name)))
        .map(schema => ({ ...schema, output: ctx.tools.get(schema.name, context.scope)!.output.schema }))
      sdk[0].text = render(schemas)
    }
    if (context.agent !== undefined) {
      // 执行只认本步已呈现的定义；搜索只改变下一步，实时撤权仍优先。
      nativePresented.set(context.agent, new Map([...nativeAllowed]
        .filter(([name]) => visible.has(name)).map(([name, entry]) => [name, entry.key])))
    }
    return output
  })

  return {
    begin(serverName: string, displayName: string, exposureConfig: McpExposureConfig = {}, namespace: { description?: string } = {}): McpConnection {
      const name = prefix(serverName)
      if (connections.has(serverName) || [...connections.keys()].some(value => name.startsWith(prefix(value)) || prefix(value).startsWith(name))
        || ctx.tools.schemas().some(schema => schema.name.startsWith(name))) throw new Error('MCP_NAMESPACE_CONFLICT')
      const connection: McpConnection = {
        serverName,
        displayName,
        ...(namespace.description === undefined ? {} : { description: namespace.description }),
        ...(exposureConfig.exposure === undefined ? {} : { exposure: exposureConfig.exposure }),
        ...(exposureConfig.toolExposure === undefined ? {} : { toolExposure: exposureConfig.toolExposure }),
        ready: false,
        abort: new AbortController(),
      }
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
      const tools = entries.filter(item => item.connection.serverName === serverName).map(item => ({
        name: item.schema.name.slice(prefix(serverName).length),
        description: item.schema.description,
        exposure: effectiveExposure(item, fallbackMode()),
      }))
      return {
        discoveredToolCount: tools.length,
        tools,
        exposure: normalizeMcpExposure(connections.get(serverName)?.exposure) ?? defaultExposure(),
      }
    },
    dispose(): void {
      stopped = true
      for (const call of dispatching.values()) call.abort.abort()
      for (const connection of connections.values()) connection.abort.abort()
      connections.clear()
      catalog.clear()
      codeExecutions.clear()
      for (const dispose of [assemble, dispatch, guard, pre, change, search]) dispose()
    },
  }
}
