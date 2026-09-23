/**
 * [INPUT]: 依赖平台 bootstrap 身份/授权快照、绑定身份与目标的 credentials、官方 MCP client 与 mcp-tools 门禁。
 * [OUTPUT]: 提供 mountMcpRuntime，组合用户连接路由、OAuth 失效状态、快照租约与可撤销的 MCP 子 fiber；认证值原样发送，OAuth 使用本机 loopback callback。
 * [POS]: bundle 的端侧 MCP 组合器；公共配置来自平台，秘密与连接只留在当前 Host。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { IncomingMessage } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import type { Context } from '@deepseek-ai/cordis'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { apply as applyMcpClient, createMcpToolDefinition, type Config as McpClientConfig, type ReconnectConfig } from '@deepseek-ai/dsh-mcp-client'
import { auth as mcpOAuthAuth, Client, StreamableHTTPClientTransport, type Tool } from '@modelcontextprotocol/client'
import type { McpResourceProvider, McpResourceRequest } from '@deepseek-ai/dsh-mcp-resources'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { OWNDSH_SETTINGS_ENTRY, startLoopbackCallback, type EnterprisePlatformService, type WebServerRoutePort } from '@owndsh/platform-client'
import { McpCredentialManager, McpOAuthProvider, mcpCredentialBinding, mcpOwnerDigest } from './mcp-oauth.js'
import { mountMcpTools, type McpConnection } from './mcp-tools.js'

/**
 * 拉取服务端的公共 assignments，并把每个用户已授权的 MCP 交给官方 client。
 * 平台状态订阅负责失效，用户动作和 prompt/tool 活动按租约刷新；连接由官方 client 管理。
 */
function publicMcpToolName(serverName: string, rawName: string): string {
  const joined = `mcp__${serverName}__${rawName}`
  const normalized = joined.replace(/[^A-Za-z0-9_-]/g, '_')
  if (normalized === joined && normalized.length <= 64) return normalized
  const hash = createHash('sha256').update(`${serverName}\0${rawName}`).digest('hex').slice(0, 12)
  return `${normalized.slice(0, 51)}_${hash}`
}

type OAuthAssignment = { type?: string; clientId?: string; scopes?: string[]; resource?: string }

declare module '@deepseek-ai/cordis' {
  interface Events {
    'loader/volatile-update'(paths: readonly (readonly string[])[]): void
  }
}

type LiveValue<T> = T | { get(): T }

interface McpRuntimeConfig {
  readonly mcp?: LiveValue<{ readonly desiredConnected?: Record<string, boolean> }>
}

interface SettingsPort {
  update(namespace: string, patch: object): Promise<void>
}

function readLiveValue<T>(value: LiveValue<T> | undefined): T | undefined {
  if (value !== undefined && value !== null && typeof value === 'object' && 'get' in value
    && typeof value.get === 'function') return value.get()
  return value as T | undefined
}

export function mountMcpRuntime(ctx: Context & { webServer: WebServerRoutePort }, platform: Pick<EnterprisePlatformService, 'request' | 'status' | 'subscribe' | 'bootstrap'>, credentials: CredentialProvider, config: McpRuntimeConfig = {}): void {
  type MountedMcp = { fiber: { dispose(): Promise<void> }; revision: number; signature: string; connection: McpConnection; disposal?: Promise<void> }
  const mounted = new Map<string, MountedMcp>()
  const managers = new Map<string, McpCredentialManager>()
  const oauthFlows = new Map<string, { serverName: string; revision: unknown; status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'; error?: string; abort: AbortController }>()
  let latestAssignments: Array<Record<string, unknown>> = []
  let assignmentGeneration = 0
  let refreshing: Promise<void> | undefined
  let leaseUntil = 0
  let revision = -1
  let stopped = false
  let cleanup: Promise<void> = Promise.resolve()
  const currentOwner = (): string | undefined => {
    const status = platform.status(), bootstrap = platform.bootstrap()
    if (!['READY', 'REFRESHING'].includes(status.state) || !status.platformUrl || !bootstrap) return undefined
    return mcpOwnerDigest({ platformUrl: status.platformUrl, userId: bootstrap.user.id,
      deviceId: bootstrap.device.id, installationId: bootstrap.device.installationId })
  }
  let owner = currentOwner()
  const managerFor = (assignment: Record<string, unknown>): McpCredentialManager => {
    if (!owner || owner !== currentOwner() || stopped) throw new Error('MCP_OWNER_INVALID')
    const binding = mcpCredentialBinding(owner, assignment)
    const serverName = assignment.serverName as string
    let manager = managers.get(serverName)
    if (manager !== undefined && (manager.abort.signal.aborted || manager.binding.bindingDigest !== binding.bindingDigest
      || manager.binding.serverId !== binding.serverId || manager.binding.ownerDigest !== binding.ownerDigest)) throw new Error('MCP_BINDING_CHANGED')
    if (manager === undefined) { manager = new McpCredentialManager(credentials, binding); managers.set(serverName, manager) }
    return manager
  }
  const disconnected = new Set<string>()
  const cleanupRequired = new Set<string>()
  const settings = (() => {
    try { return ctx.get('settings') as SettingsPort }
    catch { return undefined }
  })()
  const desiredConnected = new Map<string, boolean>()
  const desiredKey = (serverName: string): string => `${owner ?? 'none'}:${serverName}`
  const loadDesired = (): void => {
    desiredConnected.clear()
    const value = readLiveValue(config.mcp)
    if (value?.desiredConnected && typeof value.desiredConnected === 'object') for (const [key, state] of Object.entries(value.desiredConnected as Record<string, unknown>)) if (typeof state === 'boolean') desiredConnected.set(key, state)
  }
  loadDesired()
  const isPaused = (serverName: string): boolean => disconnected.has(serverName) || desiredConnected.get(desiredKey(serverName)) === false
  const saveDesired = async (serverName: string, connected: boolean): Promise<void> => {
    desiredConnected.set(desiredKey(serverName), connected)
    if (settings !== undefined) await settings.update(OWNDSH_SETTINGS_ENTRY, { mcp: { desiredConnected: Object.fromEntries(desiredConnected) } })
  }
  const platformReady = (): boolean => owner !== undefined && owner === currentOwner()
  const presentation = mountMcpTools(ctx, {
    fresh: () => !stopped && platformReady() && performance.now() < leaseUntil,
    refresh: () => refresh(),
    authorizationRequired: () => [...managers].filter(([name, manager]) => !isPaused(name) && manager.authorizationRequired()).map(([name]) => name),
  })
  const retire = async (serverName: string, current: MountedMcp): Promise<void> => {
    presentation.revoke(current.connection)
    current.disposal ??= current.fiber.dispose()
    await current.disposal
    if (mounted.get(serverName) === current) mounted.delete(serverName)
  }
  const oauthRoute = ctx.webServer.register({
    kind: 'exact',
    path: '/enterprise/api/v1/local/mcp/oauth/start',
    handler: async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405).end(); return }
      try {
        const input = await readJson(request) as { serverName?: unknown }
        const serverName = typeof input.serverName === 'string' ? input.serverName : ''
        await refresh()
        const assignment = latestAssignments.find(value => value.serverName === serverName)
        const auth = assignment?.auth as OAuthAssignment | undefined
        const url = typeof assignment?.url === 'string' ? assignment.url : undefined
        if (assignment === undefined || auth?.type !== 'oauth' || url === undefined) throw new Error('MCP OAuth 配置不存在')
        const manager = managerFor(assignment)
        for (const pending of oauthFlows.values()) if (pending.serverName === serverName) pending.abort.abort()
        const flowId = randomUUID()
        if (performance.now() >= leaseUntil) throw new Error('MCP_AUTHORIZATION_STALE')
        await saveDesired(serverName, true)
        const flow = { serverName, revision: assignment.revision, status: 'PENDING' as const, abort: new AbortController() }
        oauthFlows.set(flowId, flow)
        const callback = await startLoopbackCallback({ expectedState: flowId, timeoutMs: 300_000, signal: flow.abort.signal })
        void callback.result.catch(() => undefined)
        const provider = new McpOAuthProvider(manager, { callback, clientId: auth.clientId, scopes: auth.scopes, resource: auth.resource, serverUrl: url, state: flowId, signal: flow.abort.signal })
        void mcpOAuthAuth(provider, { serverUrl: url, ...(auth.scopes?.length ? { scope: auth.scopes.join(' ') } : {}) }).then(() => {
          if (oauthFlows.get(flowId) === flow && !flow.abort.signal.aborted && platformReady() && !stopped && managers.get(serverName) === manager
            && latestAssignments.some(value => value.serverName === serverName && value.revision === flow.revision)) {
            oauthFlows.set(flowId, { ...flow, status: 'SUCCEEDED' })
            disconnected.delete(serverName)
            void refresh(true)
          }
        }).catch(() => {
          if (oauthFlows.get(flowId) !== flow) return
          oauthFlows.set(flowId, { ...flow, status: flow.abort.signal.aborted ? 'CANCELLED' : 'FAILED', ...(flow.abort.signal.aborted ? {} : { error: 'OAUTH_FAILED' }) })
        }).finally(() => callback.cancel())
        response.writeHead(202, { 'cache-control': 'no-store', 'content-type': 'application/json' }).end(JSON.stringify({ data: { started: true, flowId } }))
      } catch { response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 'ENT_INVALID_REQUEST' } })) }
    },
  })
  const oauthStatusRoute = ctx.webServer.register({
    kind: 'exact', path: '/enterprise/api/v1/local/mcp/oauth/status', handler: async (request, response) => {
      if (request.method !== 'GET') { response.writeHead(405).end(); return }
      const flowId = new URL(request.url ?? '/', 'http://localhost').searchParams.get('flowId') ?? ''
      const flow = oauthFlows.get(flowId)
      response.writeHead(flow === undefined ? 404 : 200, { 'cache-control': 'no-store', 'content-type': 'application/json' }).end(JSON.stringify(flow === undefined ? { error: { code: 'ENT_INVALID_REQUEST' } } : { data: { flowId, serverName: flow.serverName, status: flow.status, ...(flow.error === undefined ? {} : { error: flow.error }) } }))
    },
  })
  const mcpStatusRoute = ctx.webServer.register({
    kind: 'exact', path: '/enterprise/api/v1/local/mcp/status', handler: async (request, response) => {
      if (request.method !== 'GET') { response.writeHead(405).end(); return }
      try {
        await refresh()
        const generation = assignmentGeneration
        const assignments = await Promise.all(latestAssignments.map(async assignment => {
          const serverName = typeof assignment.serverName === 'string' ? assignment.serverName : ''
          const auth = assignment.auth as { type?: string } | undefined
          const manager = auth?.type === 'oauth' || auth?.type === 'api-key' ? managerFor(assignment) : undefined
          return {
            serverName,
            displayName: typeof assignment.displayName === 'string' ? assignment.displayName : serverName,
            presentation: assignment.presentation === 'full' ? 'full' : 'search',
            connected: performance.now() < leaseUntil && mounted.get(serverName)?.connection.ready === true && !mounted.get(serverName)!.connection.abort.signal.aborted,
            desiredConnected: !isPaused(serverName),
            ...(cleanupRequired.has(serverName) ? { errorCode: 'MCP_CLEANUP_REQUIRED' } : {}),
            ...presentation.status(serverName),
            ...(manager?.authorizationRequired() ? { errorCode: 'MCP_AUTH_REQUIRED' } : {}),
            authType: auth?.type === 'oauth' ? 'oauth' : auth?.type === 'api-key' ? 'api-key' : 'none',
            configured: manager !== undefined ? await manager.configured(auth!.type as 'oauth' | 'api-key') : true,
          }
        }))
        response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'application/json' }).end(JSON.stringify({ data: { assignments: generation === assignmentGeneration ? assignments : [] } }))
      } catch { response.writeHead(503, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 'ENT_PLATFORM_UNAVAILABLE' } })) }
    },
  })
  const mcpConnectRoute = ctx.webServer.register({
    kind: 'exact', path: '/enterprise/api/v1/local/mcp/connect', handler: async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405).end(); return }
      try {
        const input = await readJson(request) as { serverName?: unknown; apiKey?: unknown }
        const serverName = typeof input.serverName === 'string' ? input.serverName : ''
        const apiKey = typeof input.apiKey === 'string' ? input.apiKey : ''
        await refresh()
        const assignment = latestAssignments.find(value => value.serverName === serverName)
        const auth = assignment?.auth as { type?: string } | undefined
        if (performance.now() >= leaseUntil || assignment === undefined || !['api-key', 'none'].includes(auth?.type ?? '')) throw new Error('MCP 连接配置不存在')
        if (auth?.type === 'api-key') {
          const manager = managerFor(assignment)
          if (apiKey.length > 0) await manager.storeApiKey(apiKey)
          else if (await manager.apiKey() === undefined) throw new Error('MCP API Key 未配置')
        }
        if (!platformReady() || stopped || latestAssignments.find(value => value.serverName === serverName) !== assignment) throw new Error('MCP_ASSIGNMENT_CHANGED')
        disconnected.delete(serverName)
        await saveDesired(serverName, true)
        void refresh(true)
        response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'application/json' }).end(JSON.stringify({ data: { configured: true } }))
      } catch { response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 'ENT_INVALID_REQUEST' } })) }
    },
  })
  const mcpDisconnectRoute = ctx.webServer.register({
    kind: 'exact', path: '/enterprise/api/v1/local/mcp/disconnect', handler: async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405).end(); return }
      let serverName: string | undefined
      try {
        const input = await readJson(request) as { serverName?: unknown }
        if (typeof input.serverName !== 'string' || input.serverName.length === 0) throw new Error('serverName invalid')
        serverName = input.serverName
        disconnected.add(serverName)
        await saveDesired(serverName, false)
        assignmentGeneration += 1
        const active = mounted.get(serverName)
        if (active !== undefined) presentation.revoke(active.connection)
        for (const flow of oauthFlows.values()) if (flow.serverName === serverName) flow.abort.abort()
        const manager = managers.get(serverName)
        try {
          if (manager !== undefined) {
            await manager.dispose(true)
            if (managers.get(serverName) === manager) managers.delete(serverName)
          }
        } finally {
          const current = mounted.get(serverName)
          if (current !== undefined) await retire(serverName, current)
        }
        if (refreshing !== undefined) await refreshing.catch(() => undefined)
        cleanupRequired.delete(serverName)
        response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'application/json' }).end(JSON.stringify({ data: { disconnected: true } }))
      } catch (error) {
        if (serverName !== undefined) cleanupRequired.add(serverName)
        response.writeHead(serverName === undefined ? 400 : 503, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: serverName === undefined ? 'ENT_INVALID_REQUEST' : 'MCP_CLEANUP_REQUIRED' } }))
      }
    },
  })
  const mcpPauseRoute = ctx.webServer.register({
    kind: 'exact', path: '/enterprise/api/v1/local/mcp/pause', handler: async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405).end(); return }
      try {
        const input = await readJson(request) as { serverName?: unknown }
        if (typeof input.serverName !== 'string' || input.serverName.length === 0) throw new Error('serverName invalid')
        if (cleanupRequired.has(input.serverName)) throw new Error('MCP_CLEANUP_REQUIRED')
        disconnected.add(input.serverName)
        await saveDesired(input.serverName, false)
        const active = mounted.get(input.serverName)
        if (active !== undefined) await retire(input.serverName, active)
        response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'application/json' }).end(JSON.stringify({ data: { paused: true } }))
      } catch { response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 'ENT_INVALID_REQUEST' } })) }
    },
  })
  const mcpReconnectRoute = ctx.webServer.register({
    kind: 'exact', path: '/enterprise/api/v1/local/mcp/reconnect', handler: async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405).end(); return }
      try {
        const input = await readJson(request) as { serverName?: unknown }
        if (typeof input.serverName !== 'string' || input.serverName.length === 0) throw new Error('serverName invalid')
        disconnected.delete(input.serverName)
        await saveDesired(input.serverName, true)
        await refresh(true)
        response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'application/json' }).end(JSON.stringify({ data: { reconnected: true } }))
      } catch { response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 'ENT_INVALID_REQUEST' } })) }
    },
  })
  const oauthCancelRoute = ctx.webServer.register({
    kind: 'exact', path: '/enterprise/api/v1/local/mcp/oauth/cancel', handler: async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405).end(); return }
      try {
        const input = await readJson(request) as { flowId?: unknown }
        const flow = typeof input.flowId === 'string' ? oauthFlows.get(input.flowId) : undefined
        if (flow === undefined) { response.writeHead(404).end(); return }
        flow.abort.abort()
        response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'application/json' }).end(JSON.stringify({ data: { cancelled: true } }))
      } catch {
        response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 'ENT_INVALID_REQUEST' } }))
      }
    },
  })
  const connectOAuth = async (assignment: Record<string, unknown>, manager: McpCredentialManager, connection: McpConnection): Promise<{ dispose(): Promise<void> }> => {
    const serverName = assignment.serverName as string
    const url = assignment.url as string
    const auth = assignment.auth as OAuthAssignment
    const timeout = typeof assignment.toolCallTimeoutMs === 'number' ? assignment.toolCallTimeoutMs : 60_000
    const state = randomUUID()
    const callback = await startLoopbackCallback({ expectedState: state, timeoutMs: 24 * 60 * 60 * 1000, signal: manager.abort.signal })
    void callback.result.catch(() => undefined)
    const provider = new McpOAuthProvider(manager, {
      callback,
      clientId: auth.clientId,
      scopes: auth.scopes,
      resource: auth.resource,
      serverUrl: url,
      state,
      signal: manager.abort.signal,
    })
    const client = new Client({ name: 'owndsh-mcp-client', version: '0.1.7-alpha.1' }, {
      capabilities: {},
      versionNegotiation: { mode: 'auto' },
      listChanged: { tools: { autoRefresh: false, debounceMs: 0, onChanged: () => { void enqueueSync() } } },
    })
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      authProvider: provider,
      requestInit: { headers: (assignment.headers ?? {}) as Record<string, string> },
    })
    let disposers = new Map<string, () => void>()
    let syncing = Promise.resolve()
    let resourceDisposer = (): void => {}
    let instructionDisposer = (): void => {}
    let disposed = false
    const sync = async (): Promise<void> => {
      const response = client.getServerCapabilities()?.tools === undefined
        ? { tools: [] as Tool[] }
        : await client.listTools(undefined, { cacheMode: 'refresh' })
      const definitions = new Map<string, ReturnType<typeof createMcpToolDefinition>>()
      for (const tool of response.tools) {
        const publicName = publicMcpToolName(serverName, tool.name)
        if (definitions.has(publicName)) throw new Error('MCP_TOOL_NAME_CONFLICT')
        definitions.set(publicName, createMcpToolDefinition(ctx, {
          name: publicName,
          rawName: tool.name,
          description: tool.description ?? '',
          inputSchema: tool.inputSchema as Record<string, unknown>,
          outputSchema: tool.outputSchema,
          taskRequired: tool.execution?.taskSupport === 'required',
          call: (args, execution) => client.callTool({ name: tool.name, arguments: args }, {
            signal: execution.signal,
            timeout,
            toolDefinition: tool,
          }),
        }))
      }
      for (const dispose of disposers.values()) dispose()
      const next = new Map<string, () => void>()
      try {
        for (const [name, definition] of definitions) next.set(name, ctx.tools.register(definition))
      } catch (error) {
        for (const dispose of next.values()) dispose()
        throw error
      }
      disposers = next
    }
    function enqueueSync(): Promise<void> {
      const task = syncing.then(sync)
      syncing = task.catch(() => undefined)
      return task
    }
    try {
      await client.connect(transport)
      await enqueueSync()
      const resources = ctx.get('mcpResources') as { register(server: string, provider: McpResourceProvider): () => void } | undefined
      if (resources === undefined) throw new Error('MCP_RESOURCES_UNAVAILABLE')
      const resourceProvider: McpResourceProvider = {
        request: async (request: McpResourceRequest, execution: ToolExecution) => {
          const options = { signal: execution.signal, timeout }
          if (request.method === 'resources/list') return await client.listResources(request.cursor === undefined ? undefined : { cursor: request.cursor }, options) as never
          if (request.method === 'resources/templates/list') return await client.listResourceTemplates(request.cursor === undefined ? undefined : { cursor: request.cursor }, options) as never
          if (request.method === 'resources/read') return await client.readResource({ uri: request.uri }, options) as never
          throw new Error('MCP_RESOURCE_METHOD_INVALID')
        },
      }
      resourceDisposer = resources.register(serverName, resourceProvider)
      const systemPrompt = ctx.get('systemPrompt') as { getSectionOrder(name: string): number; section(value: { name: string; order: number; interpolate: boolean; text: () => string }): () => void } | undefined
      if (systemPrompt === undefined) throw new Error('MCP_SYSTEM_PROMPT_UNAVAILABLE')
      const instructions = client.getInstructions()?.trimEnd() ?? ''
      if (Buffer.byteLength(instructions) > 32 * 1024) throw new Error('MCP_INSTRUCTIONS_TOO_LARGE')
      instructionDisposer = systemPrompt.section({
        name: `mcp:${serverName}`,
        order: systemPrompt.getSectionOrder('MCP_SERVERS'),
        interpolate: false,
        text: () => instructions ? `### MCP server: ${serverName}\n\n${instructions}` : '',
      })
      connection.ready = true
      return {
        async dispose(): Promise<void> {
          if (disposed) return
          disposed = true
          connection.ready = false
          resourceDisposer()
          instructionDisposer()
          for (const dispose of disposers.values()) dispose()
          disposers = new Map()
          await syncing.catch(() => undefined)
          await client.close().catch(() => undefined)
          await transport.close().catch(() => undefined)
          callback.cancel()
        },
      }
    } catch (error) {
      callback.cancel()
      await client.close().catch(() => undefined)
      await transport.close().catch(() => undefined)
      throw error
    }
  }
  const reconcile = async (assignments: Array<Record<string, unknown>>, generation: number): Promise<void> => {
    // 未连接的 OAuth flow 同样受快照撤权约束。
    for (const flow of oauthFlows.values()) {
      const desired = assignments.find(value => value.serverName === flow.serverName)
      if (!desired || desired.revision !== flow.revision) flow.abort.abort()
    }
    const invalidated: Promise<void>[] = []
    for (const [serverName, manager] of managers) {
      const desired = assignments.find(value => value.serverName === serverName)
      const binding = desired && owner ? mcpCredentialBinding(owner, desired) : undefined
      if (!binding || binding.serverId !== manager.binding.serverId || binding.bindingDigest !== manager.binding.bindingDigest) {
        invalidated.push(manager.dispose())
        managers.delete(serverName)
      }
    }
    // 先关闭被撤回或改版的连接门禁，不能等待其他服务的 token 网络请求。
    for (const [serverName, current] of mounted) {
      const desired = assignments.find(value => value.serverName === serverName)
      if (desired === undefined || desired.revision !== current.revision || isPaused(serverName)) {
        presentation.revoke(current.connection)
        for (const flow of oauthFlows.values()) if (flow.serverName === serverName) flow.abort.abort()
      }
    }
    for (const [serverName, current] of mounted) {
      if (current.connection.abort.signal.aborted) await retire(serverName, current)
    }
    await Promise.all(invalidated)
    for (const assignment of assignments) {
      if (stopped || generation !== assignmentGeneration || !platformReady()) return
      const serverName = typeof assignment.serverName === 'string' ? assignment.serverName : undefined
      const url = typeof assignment.url === 'string' ? assignment.url : undefined
      if (serverName === undefined || url === undefined || isPaused(serverName)) continue
      const serverRevision = typeof assignment.revision === 'number' ? assignment.revision : 0
      let headers = (assignment.headers ?? {}) as Record<string, string>
      const auth = assignment.auth as (OAuthAssignment & { headerName?: string }) | undefined
      try {
        if (auth?.type === 'oauth') {
          const manager = managerFor(assignment)
          if (!await manager.configured('oauth')) {
            const current = mounted.get(serverName)
            if (current !== undefined) await retire(serverName, current)
            continue
          }
        } else if (auth?.type === 'api-key') {
          const manager = managerFor(assignment)
          const secret = await manager.apiKey()
          if (secret === undefined) {
            const current = mounted.get(serverName)
            if (current !== undefined) await retire(serverName, current)
            continue
          }
          headers = { ...headers, [auth.headerName ?? 'Authorization']: secret }
        }
        if (stopped || generation !== assignmentGeneration || isPaused(serverName)) return
        const clientConfig: Extract<McpClientConfig, { transport: 'streamable-http' }> = {
          transport: 'streamable-http', serverName, url, headers,
          toolCallTimeoutMs: typeof assignment.toolCallTimeoutMs === 'number' ? assignment.toolCallTimeoutMs : 60_000,
          failOnStartupError: true,
          reconnect: (assignment.reconnect ?? {}) as ReconnectConfig,
        }
        const signature = auth?.type === 'oauth'
          ? JSON.stringify({ revision: serverRevision, url, headers, auth })
          : JSON.stringify({ revision: serverRevision, ...clientConfig })
        const previous = mounted.get(serverName)
        if (previous?.signature === signature && !previous.connection.abort.signal.aborted) {
          continue
        }
        if (previous !== undefined) await retire(serverName, previous)
        if (stopped || generation !== assignmentGeneration) return
        const connection = presentation.begin(serverName, typeof assignment.displayName === 'string' ? assignment.displayName : serverName,
          assignment.presentation === 'full' ? 'full' : 'search')
        try {
          const fiber = auth?.type === 'oauth'
            ? await connectOAuth(assignment, managerFor(assignment), connection)
            : ctx.plugin({ name: 'owndsh-mcp-client', inject: ['tools'], apply: applyMcpClient }, clientConfig)
          const current = { fiber, revision: serverRevision, signature, connection }
          mounted.set(serverName, current)
          await fiber
          if (stopped || generation !== assignmentGeneration || isPaused(serverName)) await retire(serverName, current)
          else presentation.ready(connection)
        } catch {
          presentation.revoke(connection)
          throw new Error('MCP_CONNECT_FAILED')
        }
      } catch {
        const failed = mounted.get(serverName)
        if (failed !== undefined) await retire(serverName, failed).catch(() => undefined)
        ctx.logger.warn('owndsh: MCP connection unavailable: %s', serverName)
      }
    }
  }
  const refresh = async (force = false): Promise<void> => {
    if (stopped || !platformReady()) return
    if (refreshing !== undefined) {
      await refreshing
      if (force) return refresh(true)
      return
    }
    const generation = assignmentGeneration
    const sentAt = performance.now()
    const pendingCleanup = cleanup
    const task = Promise.resolve().then(async () => {
      try {
        await pendingCleanup
        if (stopped || generation !== assignmentGeneration || !platformReady()) return
        if (!force && sentAt < leaseUntil) {
          await reconcile(latestAssignments, generation)
          return
        }
        const response = await platform.request('/enterprise/api/v1/mcp/assignments')
        if (!response.ok) {
          if ([401, 403, 404].includes(response.status)) {
            leaseUntil = 0
            latestAssignments = []
            await reconcile([], generation)
          }
          return
        }
        const body = await response.json() as { data?: { assignments?: Array<Record<string, unknown>>; revision?: number; validForMs?: number } }
        if (stopped || generation !== assignmentGeneration || !platformReady()) return
        if (!Array.isArray(body.data?.assignments) || !Number.isSafeInteger(body.data.revision)
          || body.data.revision! < revision || body.data.validForMs !== 60_000) throw new Error('MCP_SNAPSHOT_INVALID')
        latestAssignments = body.data.assignments
        revision = body.data.revision!
        leaseUntil = sentAt + body.data.validForMs
        await reconcile(latestAssignments, generation)
      } catch {
        ctx.logger.debug('owndsh: MCP assignments unavailable')
      }
    })
    refreshing = task
    try { await task } finally { if (refreshing === task) refreshing = undefined }
  }
  const unwatchDesired = ctx.on('loader/volatile-update', paths => {
    if (!paths.some(path => path[0] === 'mcp')) return
    desiredConnected.clear()
    const value = readLiveValue(config.mcp)
    if (value?.desiredConnected && typeof value.desiredConnected === 'object') for (const [key, state] of Object.entries(value.desiredConnected as Record<string, unknown>)) if (typeof state === 'boolean') desiredConnected.set(key, state)
    void refresh(true)
  })
  const unsubscribe = platform.subscribe(status => {
    const nextOwner = currentOwner()
    if (owner === nextOwner && platformReady()) { void refresh(); return }
    const previousOwner = owner
    owner = nextOwner
    assignmentGeneration += 1
    leaseUntil = 0
    revision = -1
    latestAssignments = []
    disconnected.clear()
    loadDesired()
    for (const flow of oauthFlows.values()) flow.abort.abort()
    oauthFlows.clear()
    const remove = nextOwner !== undefined || ['SIGNED_OUT', 'UNCONFIGURED', 'AUTH_EXPIRED', 'DEVICE_REVOKED'].includes(status.state)
    const pending = [...managers.values()].map(manager => manager.dispose(remove))
    managers.clear()
    for (const [serverName, current] of mounted) pending.push(retire(serverName, current))
    // 旧 reconcile 可能还持有已从 map 移除的 manager，必须等它结束再清理本身份记录。
    cleanup = Promise.all([cleanup, refreshing, ...pending]).then(async () => {
      if (!remove || !previousOwner) return
      // 包含此前已撤权/改地址的记录；只清理本身份的 OwnDsh MCP grant。
      for (const entry of await credentials.listRecords()) {
        if (!entry.key.startsWith('owndsh-mcp/')) continue
        const record = await credentials.readRecord(entry.key)
        if (record?.kind === 'grant' && (record.payload as { ownerDigest?: string } | null)?.ownerDigest === previousOwner) {
          await credentials.deleteRecord(entry.key)
        }
      }
    })
    void cleanup.catch(() => { ctx.logger.warn('owndsh: MCP credential cleanup incomplete') })
    if (nextOwner) void refresh(true)
  })
  void refresh()
  ctx.effect(() => async () => {
    stopped = true
    assignmentGeneration += 1
    leaseUntil = 0
    unsubscribe()
    unwatchDesired()
    for (const flow of oauthFlows.values()) flow.abort.abort()
    const pending = [...managers.values()].map(manager => manager.dispose())
    for (const current of mounted.values()) presentation.revoke(current.connection)
    oauthRoute()
    oauthStatusRoute()
    oauthCancelRoute()
    mcpStatusRoute()
    mcpConnectRoute()
    mcpDisconnectRoute()
    mcpPauseRoute()
    mcpReconnectRoute()
    const results = await Promise.allSettled([cleanup, ...pending, refreshing,
      ...[...mounted].map(([serverName, current]) => retire(serverName, current))])
    presentation.dispose()
    const failures = results.filter(result => result.status === 'rejected')
    if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'MCP_CLEANUP_FAILED')
  }, 'mcp-runtime.lifecycle')
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > 32 * 1024) throw new Error('request too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
