/**
 * [INPUT]: 依赖真实 Cordis/tools/systemPrompt/pi-ai、可控 HTTP MCP/模型服务和端侧运行时。
 * [OUTPUT]: 验证工具简介目录不预热会话、search 隔离/预算、native/PTC 请求正文、代次撤销、真实 client 连接、同一会话 OAuth 失效恢复与提前 401 不重放。
 * [POS]: bundle 的 MCP 行为回归；使用受控工具与假凭据，不调用外部模型或真实 OAuth 服务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createServer, type IncomingMessage } from 'node:http'
import { once } from 'node:events'
import { performance } from 'node:perf_hooks'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import CodeRuntime, { type CodeRunRequest } from '@deepseek-ai/dsh-code-runtime'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as PiAi from '@deepseek-ai/dsh-llm-pi-ai'
import { createScope } from '@deepseek-ai/dsh-scope'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openSystemBrowser } from '@owndsh/platform-client'
import { mountMcpTools } from '../src/mcp-tools.js'
import { mountMcpRuntime } from '../src/mcp-runtime.js'
import { McpCredentialManager, mcpCredentialBinding, mcpOwnerDigest } from '../src/mcp-oauth.js'

vi.mock('@owndsh/platform-client', async importOriginal => ({
  ...await importOriginal<object>(), openSystemBrowser: vi.fn(),
}))

const disposals: Array<() => unknown> = []
afterEach(async () => { for (const dispose of disposals.splice(0).reverse()) await dispose(); vi.restoreAllMocks(); vi.mocked(openSystemBrowser).mockReset() })
const first = { id: 'first', session: { append() {} } } as any
const second = { id: 'second', session: { append() {} } } as any
const tool = (name: string, description = name): ToolDefinition => defineTool({
  name, description, parameters: {},
  output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
  execute: vi.fn(async () => 'done'),
})
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }

async function host(mode: 'native' | 'ptc' | 'both' = 'native', language = 'typescript') {
  const ctx = new Context()
  disposals.push(() => ctx.fiber.dispose())
  await ctx.plugin(SystemPrompt)
  if (mode !== 'native') await ctx.plugin(class extends CodeRuntime {
    language = language
    isolation = 'test-controlled-binding-dispatch'
    async run(request: CodeRunRequest) {
      // 受控替身仅调用真实 PTC bindings；这里不声称验证 TS/Python 解释器。
      const { name, args } = JSON.parse(request.program)
      try { return { value: await request.bindings.find(value => value.global === 'tools')!.functions[name]!(args), logs: [] } }
      catch { return { logs: [], error: { kind: 'exception' as const, message: 'binding rejected' } } }
    }
  })
  await ctx.plugin(ToolRuntime, { mode })
  return ctx
}

async function call(ctx: Context, name: string, args: unknown = {}, agent = first, ptc = false) {
  return ctx.tools.execute({ callId: 'test-call' as any, name: ptc ? 'run_code' : name,
    arguments: ptc ? { code: JSON.stringify({ name, args }), description: 'Test controlled binding' } : args, agent, signal: new AbortController().signal })
}

async function json(request: IncomingMessage) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString())
}

async function listen(handler: Parameters<typeof createServer>[0]) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  disposals.push(async () => { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())) })
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`
}

describe('MCP search and request presentation', () => {
  it('includes every discovered tool for full presentation within budget', async () => {
    const ctx = await host()
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', 'full')
    ctx.tools.register(tool('mcp__docs__read'))
    ctx.tools.register(tool('mcp__docs__write'))
    surface.ready(connection)
    const assembly = await ctx.systemPrompt.assemble({ scope: first, agent: first })
    expect(assembly.tools.map(value => value.name)).toEqual(expect.arrayContaining([
      'mcp__docs__read', 'mcp__docs__write',
    ]))
    expect(surface.status('docs')).toMatchObject({ discoveredToolCount: 2, effectivePresentation: 'full' })
  })

  it.each([['native', 'typescript'], ['ptc', 'typescript'], ['both', 'typescript'], ['ptc', 'python'], ['both', 'python']] as const)(
    'sends only selected MCP schemas through official pi-ai: %s / %s', async (mode, language) => {
      const requests: any[] = []
      const url = await listen(async (request, response) => {
        requests.push(await json(request))
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.end(`data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', model: 'test', choices: [{ index: 0, delta: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`)
      })
      const ctx = await host(mode, language)
      await ctx.plugin(LlmRuntime)
      await ctx.plugin(PiAi, { providers: { probe: { api: 'openai-completions', baseURL: url, models: [{ id: 'test' }],
        headers: { Authorization: 'Bearer test-only' } } } })
      const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
      disposals.push(() => surface.dispose())
      const connection = surface.begin('docs', '资料', 'search')
      for (let i = 0; i < 100; i++) ctx.tools.register(tool(`mcp__docs__read_${i}`, i === 7 ? '查询财务报表 {{remote_marker}} */ `描述`' : `document ${i}`))
      ctx.tools.register(tool('ordinary'))
      ctx.tools.register(tool('mcp__personal__read'))
      surface.ready(connection)
      async function wire(agent = first) {
        const assembly = await ctx.systemPrompt.assemble({ scope: agent, agent })
        const chunks = []
        for await (const chunk of ctx.llm.stream({ provider: 'probe', model: 'test', system: renderPrompt(assembly), messages: [], tools: assembly.tools })) chunks.push(chunk)
        expect(requests.length).toBeGreaterThan(0)
        return { assembly, body: JSON.stringify(requests.at(-1)) }
      }
      const cold = await wire()
      expect(cold.body).toContain('mcp_tool_search')
      expect(cold.body).toContain('ordinary')
      expect(cold.body).toContain('mcp__personal__read')
      expect(cold.body).not.toContain('mcp__docs__')
      if (mode !== 'native') expect(cold.body).toContain('run_code')
      const search = await call(ctx, 'mcp_tool_search', { query: '财务报表', limit: 5 }, first, mode === 'ptc')
      expect(search.isError, JSON.stringify(search)).toBeFalsy()
      expect(JSON.stringify(search)).toContain('mcp__docs__read_7')
      expect(JSON.stringify(search)).not.toContain('parameters')
      const hot = await wire()
      expect(hot.body).toContain('mcp__docs__read_7')
      expect(hot.body).not.toContain('mcp__docs__read_8')
      expect(hot.body).toContain('{{remote_marker}}')
      expect((await wire(second)).body).not.toContain('mcp__docs__')
      expect((await call(ctx, 'mcp__docs__read_7', {}, first, mode === 'ptc')).isError).toBeFalsy()
      expect((await call(ctx, 'mcp__docs__read_8', {}, first, mode === 'ptc')).isError).toBe(true)
      expect((await call(ctx, 'ordinary', {}, first, mode === 'ptc')).isError).toBeFalsy()
    }, 20_000,
  )

  it('enforces scope restrictions, search limits, LRU and aggregate full budgets', async () => {
    const ctx = await host()
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', 'full')
    for (let i = 0; i < 20; i++) ctx.tools.register(tool(`mcp__docs__read_${String(i).padStart(2, '0')}`))
    ctx.tools.register(tool('mcp__docs__huge', 'x'.repeat(17 * 1024)))
    surface.ready(connection)
    expect(surface.status('docs')).toMatchObject({ effectivePresentation: 'search', errorCode: 'MCP_BUDGET_EXCEEDED', discoveredToolCount: 20 })
    expect((await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.filter(value => value.name.startsWith('mcp__'))).toHaveLength(0)
    for (let i = 0; i < 17; i++) expect((await call(ctx, 'mcp_tool_search', { query: `mcp__docs__read_${String(i).padStart(2, '0')}`, limit: 1 })).isError).toBeFalsy()
    let shown = (await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.map(value => value.name)
    expect(shown.filter(value => value.startsWith('mcp__'))).toHaveLength(16)
    expect(shown).not.toContain('mcp__docs__read_00')
    await call(ctx, 'mcp__docs__read_01')
    await call(ctx, 'mcp_tool_search', { query: 'mcp__docs__read_17', limit: 1 })
    shown = (await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.map(value => value.name)
    expect(shown).toContain('mcp__docs__read_01')
    expect(shown).not.toContain('mcp__docs__read_02')
    const scope = createScope(ctx, second)
    await scope.ctx.inject(['tools'], child => { child.tools.restrict({ deny: ['mcp__docs__read_01'] }) })
    const search = await call(ctx, 'mcp_tool_search', { query: 'read', serverName: 'docs', limit: 8 }, second)
    expect(JSON.stringify(search)).not.toContain('mcp__docs__read_01')
    const emptyScope = await call(ctx, 'mcp_tool_search', { query: 'read', serverName: '' }, second)
    expect(emptyScope.isError).toBe(false)
    expect((await call(ctx, 'mcp_tool_search', { query: '!!!' })).value).toMatchObject({ reason: 'NO_MATCH' })
    expect((await call(ctx, 'mcp_tool_search', { query: 'read', serverName: 'missing' })).value).toMatchObject({ reason: 'NO_MATCH' })
    expect((await call(ctx, 'mcp_tool_search', { query: 'x'.repeat(257) })).isError).toBe(true)
    expect((await call(ctx, 'mcp_tool_search', { query: 'read', limit: 9 })).isError).toBe(true)
  })

  it('bounds SDK expansion in both mode, beyond the raw JSON schema size', async () => {
    const ctx = await host('both')
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    for (const server of ['a', 'b']) {
      const connection = surface.begin(server, server, 'full')
      for (let i = 0; i < 8; i++) ctx.tools.register(tool(`mcp__${server}__large_${i}`, '说明'.repeat(1100)))
      surface.ready(connection)
    }
    expect(surface.status('a').effectivePresentation).toBe('search')
    const result = await call(ctx, 'mcp_tool_search', { query: 'large', limit: 8 })
    expect(result.isError).toBeFalsy()
    const loaded = (result.value as any).loadedNames
    expect(loaded.length).toBeLessThan(8)
    const assembly = await ctx.systemPrompt.assemble({ scope: first, agent: first })
    const schemas = assembly.tools.filter(value => value.name.startsWith('mcp__'))
    expect(schemas.map(value => value.name)).toEqual(loaded)
    expect(Buffer.byteLength(JSON.stringify(schemas)) + Buffer.byteLength(assembly.variables.owndsh_mcp_sdk!)).toBeLessThanOrEqual(64 * 1024)
  })

  it('preserves identical schema warmth but rejects changes while pre-execute is waiting', async () => {
    const ctx = await host()
    let fresh = true
    const surface = mountMcpTools(ctx, { fresh: () => fresh, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', 'search')
    let unregister = ctx.tools.register(tool('mcp__docs__read'))
    surface.ready(connection)
    await call(ctx, 'mcp_tool_search', { query: 'read' })
    unregister()
    unregister = ctx.tools.register(tool('mcp__docs__read'))
    await Promise.resolve()
    expect((await call(ctx, 'mcp__docs__read')).isError).toBeFalsy()
    const entered = deferred(), release = deferred()
    const wait = ctx.on('tools/pre-execute', async (exec, next) => {
      if (exec.name === 'mcp__docs__read') { entered.resolve(); await release.promise }
      return next()
    })
    const pending = call(ctx, 'mcp__docs__read')
    await entered.promise
    unregister()
    const replacement = tool('mcp__docs__read', 'changed schema generation')
    vi.spyOn(replacement, 'execute')
    ctx.tools.register(replacement)
    await Promise.resolve()
    release.resolve()
    expect((await pending).isError).toBe(true)
    expect(replacement.execute).not.toHaveBeenCalled()
    wait()
    expect((await call(ctx, 'mcp__docs__read')).isError).toBe(true)
    await call(ctx, 'mcp_tool_search', { query: 'read' })
    expect((await call(ctx, 'mcp__docs__read')).isError).toBeFalsy()
    fresh = false
    expect((await call(ctx, 'mcp__docs__read')).isError).toBe(true)
    fresh = true
    surface.revoke(connection)
    expect((await call(ctx, 'mcp__docs__read')).isError).toBe(true)
    expect((await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.map(value => value.name)).not.toContain('mcp__docs__read')
  })

  it('refuses a foreign namespace and a replaced SDK without altering ordinary tools', async () => {
    const ctx = await host('both')
    ctx.tools.register(tool('mcp__foreign__read'))
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    expect(() => surface.begin('foreign', 'Foreign', 'search')).toThrow('MCP_NAMESPACE_CONFLICT')
    expect((await call(ctx, 'mcp__foreign__read')).isError).toBeFalsy()
    ctx.on('system-prompt/assemble', async (assembly, _context, next) => {
      assembly.sections.find(value => value.name === 'tools:sdk')!.text = 'foreign SDK'
      return next()
    })
    await expect(ctx.systemPrompt.assemble({ scope: first, agent: first })).rejects.toThrow('MCP_PRESENTATION_UNSUPPORTED')
  })

  it('aborts a dispatch if the official definition changes after the guard', async () => {
    const ctx = await host()
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', 'full')
    const unregister = ctx.tools.register(tool('mcp__docs__read'))
    surface.ready(connection)
    const entered = deferred(), release = deferred()
    ctx.on('tools/execute', async (_exec, next) => { entered.resolve(); await release.promise; return next() })
    const pending = call(ctx, 'mcp__docs__read')
    await entered.promise
    unregister()
    const replacement = tool('mcp__docs__read', 'new schema')
    const execute = vi.spyOn(replacement, 'execute')
    ctx.tools.register(replacement)
    release.resolve()
    expect((await pending).isError).toBe(true)
    expect(execute).not.toHaveBeenCalled()
  })
})

describe('official MCP client integration', () => {
  it('discovers, remounts and revokes a search server, then removes all registrations on logout/disposal', async () => {
    const methods: string[] = []
    const url = await listen(async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405).end(); return }
      const body = await json(request)
      methods.push(body.method)
      if (body.id === undefined) { response.writeHead(202).end(); return }
      const result = body.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'test', version: '1' } }
        : body.method === 'tools/list' ? { tools: [{ name: 'read', description: 'read docs', inputSchema: { type: 'object', properties: {} } }] }
          : { content: [{ type: 'text', text: 'MCP reply' }] }
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }))
    })
    const ctx = await host()
    const routes = new Map<string, any>()
    ctx.provide('webServer', { register: (route: any) => { routes.set(route.path, route); return () => routes.delete(route.path) } })
    const localUrl = await listen((request, response) => { void routes.get(request.url)?.handler(request, response) })
    let state = 'READY'
    let revision = 1
    let granted = true
    let now = performance.now()
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    let listener!: (status: any) => void
    const platform = {
      status: () => ({ state, platformUrl: 'https://platform.example' }),
      bootstrap: () => ({ user: { id: '1' }, device: { id: '2', installationId: 'installation-a' } }),
      subscribe: (callback: typeof listener) => { listener = callback; return () => {} },
      request: vi.fn(async () => Response.json({ data: { revision, validForMs: 60000, assignments: granted ? [
        { id: '3', serverName: 'docs', displayName: 'Docs', revision, url, transport: 'streamable-http', headers: {}, presentation: 'search', auth: { type: 'none' }, reconnect: { enabled: false } },
      ] : [] } })),
    }
    const fiber = await ctx.plugin({ inject: ['tools', 'webServer'], apply: async (child: Context) => { mountMcpRuntime(child as any, platform as any, { listRecords: async () => [] } as any) } })
    await vi.waitFor(() => expect(ctx.tools.get('mcp__docs__read')).toBeDefined())
    const cold = await ctx.systemPrompt.assemble({ scope: first, agent: first })
    expect(cold.tools.map(value => value.name)).not.toContain('mcp__docs__read')
    const directory = await (await fetch(`${localUrl}/enterprise/api/v1/local/mcp/status`)).json()
    expect(directory.data.assignments[0]).toMatchObject({ discoveredToolCount: 1, tools: [{ name: 'read', description: 'read docs' }] })
    expect(Object.keys(directory.data.assignments[0].tools[0]).sort()).toEqual(['description', 'name'])
    expect((await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.map(value => value.name)).not.toContain('mcp__docs__read')
    expect((await call(ctx, 'mcp_tool_search', { query: 'read' })).isError).toBeFalsy()
    expect((await call(ctx, 'mcp__docs__read')).isError).toBeFalsy()
    expect(methods.filter(value => value === 'tools/call')).toHaveLength(1)
    expect(platform.request).toHaveBeenCalledTimes(1)
    const pause = await fetch(`${localUrl}/enterprise/api/v1/local/mcp/pause`, { method: 'POST', body: JSON.stringify({ serverName: 'docs' }) })
    expect(pause.status).toBe(200)
    expect(ctx.tools.get('mcp__docs__read')).toBeUndefined()
    expect((await (await fetch(`${localUrl}/enterprise/api/v1/local/mcp/status`)).json()).data.assignments[0]).toMatchObject({ discoveredToolCount: 0, tools: [] })
    const reconnect = await fetch(`${localUrl}/enterprise/api/v1/local/mcp/reconnect`, { method: 'POST', body: JSON.stringify({ serverName: 'docs' }) })
    expect(reconnect.status).toBe(200)
    await ctx.systemPrompt.assemble({ scope: first, agent: first })
    expect(ctx.tools.get('mcp__docs__read')).toBeDefined()
    const disconnect = await fetch(`${localUrl}/enterprise/api/v1/local/mcp/disconnect`, {
      method: 'POST', body: JSON.stringify({ serverName: 'docs' }),
    })
    expect(disconnect.status).toBe(200)
    expect(ctx.tools.get('mcp__docs__read')).toBeUndefined()
    const disconnectedStatus = await (await fetch(`${localUrl}/enterprise/api/v1/local/mcp/status`)).json()
    expect(disconnectedStatus.data.assignments).toEqual([expect.objectContaining({
      serverName: 'docs',
      connected: false,
      desiredConnected: false,
      discoveredToolCount: 0,
      tools: [],
    })])
    await ctx.systemPrompt.assemble({ scope: first, agent: first })
    expect(ctx.tools.get('mcp__docs__read')).toBeUndefined()
    const connect = await fetch(`${localUrl}/enterprise/api/v1/local/mcp/connect`, {
      method: 'POST', body: JSON.stringify({ serverName: 'docs' }),
    })
    expect(connect.status).toBe(200)
    await ctx.systemPrompt.assemble({ scope: first, agent: first })
    expect(ctx.tools.get('mcp__docs__read')).toBeDefined()
    const oldDefinition = ctx.tools.get('mcp__docs__read')
    revision++
    now += 60_001
    const changed = await ctx.systemPrompt.assemble({ scope: first, agent: first })
    expect(ctx.tools.get('mcp__docs__read')).not.toBe(oldDefinition)
    expect(changed.tools.map(value => value.name)).not.toContain('mcp__docs__read')
    expect((await call(ctx, 'mcp__docs__read')).isError).toBe(true)
    await call(ctx, 'mcp_tool_search', { query: 'read' })
    expect((await call(ctx, 'mcp__docs__read')).isError).toBeFalsy()
    granted = false
    revision++
    now += 60_001
    expect((await call(ctx, 'mcp__docs__read')).isError).toBe(true)
    expect(ctx.tools.get('mcp__docs__read')).toBeUndefined()
    expect(methods.filter(value => value === 'tools/call')).toHaveLength(2)
    granted = true
    revision++
    now += 60_001
    await ctx.systemPrompt.assemble({ scope: first, agent: first })
    expect(ctx.tools.get('mcp__docs__read')).toBeDefined()
    state = 'SIGNED_OUT'
    listener({ state })
    expect((await call(ctx, 'mcp__docs__read')).isError).toBe(true)
    await vi.waitFor(() => expect(ctx.tools.get('mcp__docs__read')).toBeUndefined())
    expect(methods.filter(value => value === 'tools/call')).toHaveLength(2)
    await fiber.dispose()
    expect(routes.size).toBe(0)
    expect(ctx.tools.get('mcp_tool_search')).toBeUndefined()
  }, 15_000)

  it.each(['search', 'full'] as const)('reauthorizes an expired OAuth grant in the same conversation: %s', async presentation => {
    const toolCalls: string[] = []
    let revoked = false
    let authorizations = 0, rejectedRefreshes = 0
    const providerUrl = await listen(async (request, response) => {
      if (request.url === '/token') {
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        const body = new URLSearchParams(Buffer.concat(chunks).toString())
        if (body.get('grant_type') === 'refresh_token') {
          rejectedRefreshes++
          response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'invalid_grant' }))
        } else {
          expect(body.get('grant_type')).toBe('authorization_code')
          expect(body.get('code_verifier')).toBeTruthy()
          authorizations++
          response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
            access_token: `access-${authorizations}`, refresh_token: `refresh-${authorizations}`, token_type: 'Bearer', expires_in: 3600,
          }))
        }
        return
      }
      if (request.method !== 'POST') { response.writeHead(405).end(); return }
      expect(request.headers.authorization).toBe(`Bearer access-${authorizations}`)
      const body = await json(request)
      if (body.id === undefined) { response.writeHead(202).end(); return }
      if (body.method === 'tools/call') {
        toolCalls.push(request.headers.authorization!)
        if (revoked) { response.writeHead(401).end('credential revoked'); return }
      }
      const result = body.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'test', version: '1' } }
        : body.method === 'tools/list' ? { tools: [{ name: 'read', inputSchema: { type: 'object', properties: {} } }] }
          : { content: [{ type: 'text', text: 'ok' }] }
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }))
    })
    const nativeFetch = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => nativeFetch(
      String(input) === 'https://oauth.example/token' ? `${providerUrl}/token` : input, init,
    ))
    vi.mocked(openSystemBrowser).mockImplementation(async raw => {
      const authorization = new URL(raw), callback = new URL(authorization.searchParams.get('redirect_uri')!)
      callback.searchParams.set('state', authorization.searchParams.get('state')!)
      callback.searchParams.set('code', 'fixture-code')
      expect((await nativeFetch(callback)).status).toBe(200)
    })
    const ctx = await host(), routes = new Map<string, any>(), records = new Map<any, any>()
    const credentials = {
      readRecord: async (key: any) => structuredClone(records.get(key)),
      modifyRecord: async (key: any, mutate: any) => { const next = await mutate(structuredClone(records.get(key))); if (next !== undefined) records.set(key, next); return records.get(key) },
      deleteRecord: async (key: any) => { records.delete(key) },
      listRecords: async () => [...records].map(([key, record]) => ({ key, kind: record.kind })),
    }
    ctx.provide('webServer', { register: (route: any) => { routes.set(route.path, route); return () => routes.delete(route.path) } })
    ctx.tools.register(tool('ordinary'))
    const localUrl = await listen((request, response) => { void routes.get(new URL(request.url!, 'http://localhost').pathname)?.handler(request, response) })
    const local = (path: string, body?: object) => fetch(`${localUrl}/enterprise/api/v1/local/mcp/${path}`, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) })
    const assignment = { id: '3', serverName: 'docs', displayName: 'Docs', revision: 1,
      url: `${providerUrl}/mcp`, transport: 'streamable-http', headers: {}, presentation,
      auth: { type: 'oauth', authorizationEndpoint: 'https://oauth.example/authorize', tokenEndpoint: 'https://oauth.example/token', clientId: 'client' }, reconnect: { enabled: false } }
    const platform = {
      status: () => ({ state: 'READY', platformUrl: 'https://platform.example' }),
      bootstrap: () => ({ user: { id: '1' }, device: { id: '2', installationId: 'installation-a' } }),
      subscribe: () => () => {},
      request: async () => Response.json({ data: { revision: 1, validForMs: 60000, assignments: [assignment] } }),
    }
    await ctx.plugin({ inject: ['tools', 'webServer'], apply: (child: Context) => { mountMcpRuntime(child as any, platform as any, credentials as any) } })
    const status = async () => (await (await local('status')).json()).data.assignments[0]
    const authorize = async () => {
      const response = await local('oauth/start', { serverName: 'docs' })
      expect(response.status).toBe(202)
      const { data: { flowId } } = await response.json()
      await vi.waitFor(async () => expect((await (await local(`oauth/status?flowId=${flowId}`)).json()).data.status).toBe('SUCCEEDED'))
      expect(await status()).toMatchObject({ connected: true, configured: true })
    }
    const load = async () => {
      if (presentation === 'search') expect((await call(ctx, 'mcp_tool_search', { query: 'read' })).isError).toBe(false)
      const assembly = await ctx.systemPrompt.assemble({ scope: first, agent: first })
      expect(assembly.tools.map(item => item.name)).toContain('mcp__docs__read')
    }
    const now = Date.now(), clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    await authorize()
    await load()
    expect((await call(ctx, 'mcp__docs__read')).isError).toBe(false)
    expect(toolCalls).toEqual(['Bearer access-1'])

    // 模型已拿到工具定义后 token 才过期；执行前刷新遭拒，不能继续发送旧凭据。
    clock.mockReturnValue(now + 3_601_000)
    const expired = await call(ctx, 'mcp__docs__read')
    expect(expired.isError).toBe(true)
    expect(JSON.stringify(expired)).toContain('MCP_AUTH_REQUIRED')
    expect(toolCalls).toEqual(['Bearer access-1'])
    expect(rejectedRefreshes).toBe(1)
    expect(await status()).toMatchObject({ authType: 'oauth', configured: false, connected: false, discoveredToolCount: 0, errorCode: 'MCP_AUTH_REQUIRED' })
    expect((await call(ctx, 'mcp_tool_search', { query: 'read' })).value).toMatchObject({ reason: 'MCP_AUTH_REQUIRED', authorizationRequired: ['docs'] })
    expect(JSON.stringify([...records])).not.toContain('refresh-1')
    expect((await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.map(item => item.name)).not.toContain('mcp__docs__read')
    expect((await call(ctx, 'ordinary')).isError).toBe(false)

    // 同一 Agent 重新走 start → PKCE loopback → token → mount，无需创建新会话。
    await authorize()
    await load()
    expect((await call(ctx, 'mcp__docs__read')).isError).toBe(false)
    expect(toolCalls).toEqual(['Bearer access-1', 'Bearer access-2'])
    expect((await status()).errorCode).toBeUndefined()

    // 远端在 expires_in 到期前撤销 token；官方只返回序列化错误，不保留 HTTP code。
    revoked = true
    const rejected = await call(ctx, 'mcp__docs__read')
    expect(rejected.isError).toBe(true)
    expect(rejected.error?.info).toBeUndefined()
    expect(JSON.stringify(rejected)).toContain('credential revoked')
    expect(toolCalls).toEqual(['Bearer access-1', 'Bearer access-2', 'Bearer access-2'])
    expect(rejectedRefreshes).toBe(1)
    expect((await call(ctx, 'ordinary')).isError).toBe(false)
    // 不自动重放；用户仍能从已连接行主动重新授权并在原 Agent 恢复。
    revoked = false
    await authorize()
    await load()
    expect((await call(ctx, 'mcp__docs__read')).isError).toBe(false)
    expect(toolCalls).toEqual(['Bearer access-1', 'Bearer access-2', 'Bearer access-2', 'Bearer access-3'])
    expect(rejectedRefreshes).toBe(1)
    expect(authorizations).toBe(3)
  }, 15_000)

  it.each(['disconnect', 'account-switch', 'dispose'] as const)('isolates credentials and cancels delayed refresh during %s', async action => {
    const headerName = action === 'account-switch' ? 'X-API-Key' : 'Authorization'
    const userValue = action === 'disconnect' ? 'Bearer account-a-key' : 'account-a-key'
    const received: Array<{ path: string; authorization: string | undefined; credential: string | string[] | undefined; apiVersion: string | string[] | undefined; clientName: string | string[] | undefined }> = []
    const url = await listen(async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405).end(); return }
      received.push({ path: request.url!, authorization: request.headers.authorization, credential: request.headers[headerName.toLowerCase()], apiVersion: request.headers['x-apifox-api-version'], clientName: request.headers['x-client-name'] })
      const body = await json(request)
      if (body.id === undefined) { response.writeHead(202).end(); return }
      const result = body.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'test', version: '1' } }
        : body.method === 'tools/list' ? { tools: [{ name: 'read', inputSchema: { type: 'object', properties: {} } }] }
          : { content: [{ type: 'text', text: 'ok' }] }
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }))
    })
    const ctx = await host(), routes = new Map<string, any>(), records = new Map<any, any>()
    const credentials = {
      readRecord: async (key: any) => structuredClone(records.get(key)),
      modifyRecord: async (key: any, mutate: any) => { const next = await mutate(structuredClone(records.get(key))); if (next !== undefined) records.set(key, next); return records.get(key) },
      deleteRecord: async (key: any) => { records.delete(key) },
      listRecords: async () => [...records].map(([key, record]) => ({ key, kind: record.kind })),
    }
    ctx.provide('webServer', { register: (route: any) => { routes.set(route.path, route); return () => routes.delete(route.path) } })
    const localUrl = await listen((request, response) => { void routes.get(request.url)?.handler(request, response) })
    const local = (path: string, body?: object) => fetch(`${localUrl}/enterprise/api/v1/local/mcp/${path}`, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) })
    let state = 'READY', userId = '1', revision = 1, now = performance.now()
    let assignment: Record<string, unknown> = { id: '3', serverName: 'docs', displayName: 'Docs', revision,
      url, transport: 'streamable-http', headers: { 'X-Apifox-Api-Version': '2025-09-01', 'X-Client-Name': 'OwnDsh' }, presentation: 'search', auth: { type: 'api-key', headerName }, reconnect: { enabled: false } }
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    let listener!: () => void
    const platform = {
      status: () => ({ state, platformUrl: 'https://platform.example' }),
      bootstrap: () => ({ user: { id: userId }, device: { id: '2', installationId: 'installation-a' } }),
      subscribe: (callback: any) => { listener = () => callback(platform.status()); return () => {} },
      request: async () => Response.json({ data: { revision, validForMs: 60000, assignments: [assignment] } }),
    }
    const fiber = await ctx.plugin({ inject: ['tools', 'webServer'], apply: (child: Context) => { mountMcpRuntime(child as any, platform as any, credentials as any) } })
    expect((await (await local('status')).json()).data.assignments[0].configured).toBe(false)
    expect(received).toHaveLength(0)
    expect((await local('connect', { serverName: 'docs', apiKey: userValue })).status).toBe(200)
    await ctx.systemPrompt.assemble({ scope: first, agent: first })
    expect(received.some(value => value.credential === userValue)).toBe(true)
    expect(received.every(value => value.apiVersion === '2025-09-01' && value.clientName === 'OwnDsh')).toBe(true)

    assignment = { ...assignment, url: `${url}/other`, revision: ++revision }
    now += 60_001
    expect((await (await local('status')).json()).data.assignments[0].configured).toBe(false)
    expect(ctx.tools.get('mcp__docs__read')).toBeUndefined()
    expect(received.some(value => value.path.includes('other'))).toBe(false)
    expect((await local('connect', { serverName: 'docs', apiKey: 'new-target-key' })).status).toBe(200)
    await ctx.systemPrompt.assemble({ scope: first, agent: first })
    expect(received.some(value => value.path.includes('other'))).toBe(true)
    expect(received.filter(value => value.path.includes('other')).every(value => value.credential === 'new-target-key')).toBe(true)
    userId = '9'
    listener()
    expect((await (await local('status')).json()).data.assignments[0].configured).toBe(false)
    expect(records.size).toBe(0)
    expect(ctx.tools.get('mcp__docs__read')).toBeUndefined()

    // 用持久化 refresh grant 驱动官方 client；只替代 token endpoint 的响应。
    assignment = { ...assignment, revision: ++revision, auth: { type: 'oauth', tokenEndpoint: 'https://oauth.example/token', clientId: 'client' } }
    const ownerDigest = mcpOwnerDigest({ platformUrl: 'https://platform.example', userId, deviceId: '2', installationId: 'installation-a' })
    const seed = new McpCredentialManager(credentials as any, mcpCredentialBinding(ownerDigest, assignment))
    await seed.storeOAuth({ access_token: 'seed-only', refresh_token: 'refresh', token_type: 'Bearer', expires_in: 1 }, new AbortController().signal)
    await seed.dispose()
    const nativeFetch = globalThis.fetch
    let token = 'oauth-access', lifetime = 31
    let entered = deferred(), release = deferred(), hold = false, refreshSignal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input) !== 'https://oauth.example/token') return nativeFetch(input, init)
      refreshSignal = init?.signal as AbortSignal
      if (hold) { entered.resolve(); await release.promise }
      return Response.json({ access_token: token, refresh_token: 'rotated', token_type: 'Bearer', expires_in: lifetime })
    })
    now += 60_001
    await local('status')
    const original = ctx.tools.get('mcp__docs__read')
    expect(original).toBeDefined()
    expect(received.at(-1)).toMatchObject({ authorization: 'Bearer oauth-access', apiVersion: '2025-09-01', clientName: 'OwnDsh' })
    const realNow = Date.now(), clock = vi.spyOn(Date, 'now').mockReturnValue(realNow + 2000)
    lifetime = 3600
    await local('status')
    expect(ctx.tools.get('mcp__docs__read')).toBe(original)
    clock.mockReturnValue(realNow + 33_000)
    await call(ctx, 'mcp_tool_search', { query: 'read' })
    expect((await call(ctx, 'mcp__docs__read')).isError).toBeFalsy()
    clock.mockReturnValue(realNow + 3_603_000)
    token = 'oauth-rotated'
    await local('status')
    expect(ctx.tools.get('mcp__docs__read')).not.toBe(original)
    expect(received.at(-1)?.authorization).toBe('Bearer oauth-rotated')

    clock.mockReturnValue(realNow + 7_204_000)
    hold = true
    const pendingStatus = local('status')
    await entered.promise
    const cleanup = action === 'disconnect' ? local('disconnect', { serverName: 'docs' })
      : action === 'dispose' ? fiber.dispose() : Promise.resolve().then(() => { userId = '10'; listener() })
    await vi.waitFor(() => expect(refreshSignal?.aborted).toBe(true))
    release.resolve()
    const result = await cleanup
    if (action === 'disconnect') expect((result as Response).status).toBe(200)
    await pendingStatus
    expect(ctx.tools.get('mcp__docs__read')).toBeUndefined()
    if (action === 'dispose') {
      expect(records.size).toBe(1)
      expect(JSON.stringify([...records])).not.toContain('access_token')
    } else {
      expect(records.size).toBe(0)
      expect((await (await local('status')).json()).data.assignments[0].configured).toBe(false)
    }
    await fiber.dispose()
  }, 15_000)

})
