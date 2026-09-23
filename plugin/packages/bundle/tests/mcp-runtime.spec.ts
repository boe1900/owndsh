/**
 * [INPUT]: 依赖真实 Cordis/tools/systemPrompt/pi-ai、可控 HTTP MCP/模型服务和端侧运行时。
 * [OUTPUT]: 验证目录不预热会话、search 去重/累加/显式释放与本步调用快照、native/PTC 请求正文、代次撤销、官方 client/SDK OAuth 协商分页与资源、连接取消及凭据隔离。
 * [POS]: bundle 的 MCP 行为回归；使用受控工具与假凭据，不调用外部模型或真实 OAuth 服务。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createServer, type IncomingMessage } from 'node:http'
import { once } from 'node:events'
import { performance } from 'node:perf_hooks'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import PtcRuntime, { type PtcRunRequest, type PtcRunSpec } from '@deepseek-ai/dsh-ptc-runtime'
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
const first = { id: 'first', session: { header: {}, append() {} } } as any
const second = { id: 'second', session: { header: {}, append() {} } } as any
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
  if (mode !== 'native') await ctx.plugin(class extends PtcRuntime {
    language = language
    isolation = 'test-controlled-binding-dispatch'
    resolve(request: PtcRunRequest): PtcRunSpec {
      return { ...request, cwd: request.cwd ?? process.cwd(), timeoutMs: request.timeoutMs ?? 60_000 }
    }
    async run(request: PtcRunSpec) {
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
      await call(ctx, 'mcp_tool_release', { names: ['mcp__docs__read_7'] }, first, mode === 'ptc')
      expect((await wire()).body).not.toContain('mcp__docs__read_7')
      expect((await call(ctx, 'mcp__docs__read_7', {}, first, mode === 'ptc')).isError).toBe(true)
    }, 20_000,
  )

  it.each([['native', 'typescript'], ['ptc', 'typescript'], ['both', 'typescript'], ['ptc', 'python'], ['both', 'python']] as const)(
    'keeps the current inference callable while searches prepare the next: %s / %s', async (mode, language) => {
      const ctx = await host(mode, language)
      const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
      disposals.push(() => surface.dispose())
      const connection = surface.begin('docs', 'Docs', 'search')
      for (let i = 0; i < 17; i++) ctx.tools.register(tool(`mcp__docs__item_${String(i).padStart(2, '0')}`))
      surface.ready(connection)
      await ctx.systemPrompt.assemble({ scope: first, agent: first })
      for (let i = 0; i < 16; i++) await call(ctx, 'mcp_tool_search', { query: `mcp__docs__item_${String(i).padStart(2, '0')}`, limit: 1 }, first, mode === 'ptc')
      await ctx.systemPrompt.assemble({ scope: first, agent: first })
      // 显式释放、加载新工具只改变下一步，本步旧调用仍按已呈现快照执行。
      await call(ctx, 'mcp_tool_release', { names: ['mcp__docs__item_00'] }, first, mode === 'ptc')
      await call(ctx, 'mcp_tool_search', { query: 'mcp__docs__item_16', limit: 1 }, first, mode === 'ptc')
      expect((await call(ctx, 'mcp__docs__item_00', {}, first, mode === 'ptc')).isError).toBe(false)
      expect((await call(ctx, 'mcp__docs__item_16', {}, first, mode === 'ptc')).isError).toBe(true)
      const next = await ctx.systemPrompt.assemble({ scope: first, agent: first })
      expect(JSON.stringify(next)).not.toContain('mcp__docs__item_00')
      expect(JSON.stringify(next)).toContain('mcp__docs__item_16')
      expect((await call(ctx, 'mcp__docs__item_00', {}, first, mode === 'ptc')).isError).toBe(true)
      expect((await call(ctx, 'mcp__docs__item_16', {}, first, mode === 'ptc')).isError).toBe(false)
    },
  )

  it('deduplicates repeated searches, combines full tools, and respects live scope revocation', async () => {
    const ctx = await host()
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const search = surface.begin('docs', 'Docs', 'search'), full = surface.begin('fixed', 'Fixed', 'full')
    for (const name of ['mcp__docs__a', 'mcp__docs__b', 'mcp__fixed__a']) ctx.tools.register(tool(name))
    surface.ready(search); surface.ready(full)
    for (const query of ['mcp__docs__a', 'mcp__docs__a', 'mcp__docs__b']) {
      expect((await call(ctx, 'mcp_tool_search', { query, limit: 1 })).value).toMatchObject({ loadedNames: [query] })
    }
    const names = (await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.map(value => value.name)
    expect(names).toEqual(['mcp__docs__a', 'mcp__docs__b', 'mcp__fixed__a', 'mcp_tool_release', 'mcp_tool_search'])
    await call(ctx, 'mcp_tool_search', { query: 'mcp__docs__a', limit: 1 })
    expect((await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.map(value => value.name)).toEqual(names)
    expect((await ctx.systemPrompt.assemble({ scope: second, agent: second })).tools.map(value => value.name)).toEqual(['mcp__fixed__a', 'mcp_tool_release', 'mcp_tool_search'])
    const scope = createScope(ctx, first)
    await scope.ctx.inject(['tools'], child => { child.tools.restrict({ deny: ['mcp__docs__a'] }) })
    expect((await call(ctx, 'mcp__docs__a')).isError).toBe(true)
    expect((await call(ctx, 'mcp__docs__b')).isError).toBe(false)
    surface.revoke(full)
    expect((await call(ctx, 'mcp__fixed__a')).isError).toBe(true)
  })

  it.each(['count', 'bytes'])('retains loads beyond former %s limits until explicitly released', async budget => {
    const ctx = await host()
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', 'search')
    for (const batch of ['alpha', 'bravo', 'charlie']) {
      for (let i = 0; i < 8; i++) ctx.tools.register(tool(`mcp__docs__${batch}_${i}`, budget === 'bytes' ? 'x'.repeat(5000) : batch))
    }
    surface.ready(connection)
    await ctx.systemPrompt.assemble({ scope: first, agent: first })
    const loaded: string[] = []
    // 一个模型响应可包含多个独占搜索调用；中间没有新的 inference。
    for (const query of ['alpha', 'bravo', 'charlie']) {
      const result = await call(ctx, 'mcp_tool_search', { query, limit: 8 })
      expect(result.isError).toBe(false)
      expect((result.value as any).loadedNames).toHaveLength(8)
      loaded.push(...(result.value as any).loadedNames)
    }
    const shown = (await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.map(value => value.name)
    expect(loaded).toHaveLength(24)
    expect(shown).toEqual(expect.arrayContaining(loaded))
    // 已呈现和未呈现工具一视同仁地保留，重复搜索不制造第二份定义。
    await call(ctx, 'mcp_tool_search', { query: 'charlie', limit: 8 })
    expect((await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.map(value => value.name)).toEqual(shown)
    await call(ctx, 'mcp_tool_release', { names: loaded.slice(0, 8) })
    const changed = (await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.map(value => value.name)
    expect(loaded.slice(0, 8).every(name => !changed.includes(name))).toBe(true)
    expect(changed).toEqual(expect.arrayContaining(loaded.slice(8)))
    expect((await call(ctx, 'mcp_tool_search', { query: 'alpha', limit: 8 })).value).toMatchObject({ loadedNames: loaded.slice(0, 8) })
  })

  it('combines full and searched tools and only permits schemas actually presented', async () => {
    const ctx = await host()
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const full = surface.begin('fixed', 'Fixed', 'full'), search = surface.begin('docs', 'Docs', 'search')
    for (let i = 0; i < 16; i++) ctx.tools.register(tool(`mcp__fixed__item_${i}`))
    ctx.tools.register(tool('mcp__docs__read'))
    surface.ready(full); surface.ready(search)
    await ctx.systemPrompt.assemble({ scope: first, agent: first })
    expect((await call(ctx, 'mcp_tool_search', { query: 'read', serverName: 'docs', limit: 1 })).value).toMatchObject({ loadedNames: ['mcp__docs__read'] })
    expect((await call(ctx, 'mcp__fixed__item_0')).isError).toBe(false)
    ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
      const output = await next()
      output.tools = output.tools.filter(schema => schema.name !== 'mcp__fixed__item_0')
      return output
    })
    await ctx.systemPrompt.assemble({ scope: first, agent: first })
    expect((await call(ctx, 'mcp__fixed__item_0')).isError).toBe(true)
  })

  it('enforces scope restrictions and search limits without automatically evicting loaded tools', async () => {
    const ctx = await host()
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', 'search')
    for (let i = 0; i < 20; i++) ctx.tools.register(tool(`mcp__docs__read_${String(i).padStart(2, '0')}`))
    ctx.tools.register(tool('mcp__docs__huge', 'x'.repeat(17 * 1024)))
    surface.ready(connection)
    expect(surface.status('docs')).toMatchObject({ effectivePresentation: 'search', discoveredToolCount: 20 })
    expect((await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.filter(value => value.name.startsWith('mcp__'))).toHaveLength(0)
    for (let i = 0; i < 17; i++) {
      expect((await call(ctx, 'mcp_tool_search', { query: `mcp__docs__read_${String(i).padStart(2, '0')}`, limit: 1 })).isError).toBeFalsy()
      await ctx.systemPrompt.assemble({ scope: first, agent: first })
    }
    let shown = (await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.map(value => value.name)
    expect(shown.filter(value => value.startsWith('mcp__'))).toHaveLength(17)
    expect(shown).toContain('mcp__docs__read_00')
    await call(ctx, 'mcp__docs__read_01')
    await call(ctx, 'mcp_tool_release', { names: ['mcp__docs__read_02'] })
    await call(ctx, 'mcp_tool_search', { query: 'mcp__docs__read_17', limit: 1 })
    shown = (await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.map(value => value.name)
    expect(shown).toContain('mcp__docs__read_01')
    expect(shown).not.toContain('mcp__docs__read_02')
    expect(shown).toContain('mcp__docs__read_17')
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

  it('preserves full mode and original descriptions beyond the former 64 KiB limit', async () => {
    const ctx = await host('both')
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    for (const server of ['a', 'b']) {
      const connection = surface.begin(server, server, 'full')
      for (let i = 0; i < 8; i++) ctx.tools.register(tool(`mcp__${server}__large_${i}`, '说明'.repeat(1100)))
      surface.ready(connection)
    }
    expect(surface.status('a').effectivePresentation).toBe('full')
    const result = await call(ctx, 'mcp_tool_search', { query: 'large', limit: 8 })
    expect(result.isError).toBeFalsy()
    const loaded = (result.value as any).loadedNames
    expect(loaded).toHaveLength(8)
    const assembly = await ctx.systemPrompt.assemble({ scope: first, agent: first })
    const schemas = assembly.tools.filter(value => value.name.startsWith('mcp__'))
    expect(schemas).toHaveLength(16)
    expect(schemas.map(value => value.name)).toEqual(expect.arrayContaining(loaded))
    expect(schemas[0]!.description).toBe('说明'.repeat(1100))
    const sdk = assembly.sections.find(section => section.name === 'tools:sdk')?.text ?? ''
    expect(Buffer.byteLength(JSON.stringify(schemas)) + Buffer.byteLength(sdk)).toBeGreaterThan(64 * 1024)
  })

  it('releases only this Agent’s dynamic tools, validates atomically, and leaves full tools connected', async () => {
    const ctx = await host()
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const dynamic = surface.begin('docs', 'Docs', 'search'), fixed = surface.begin('fixed', 'Fixed', 'full')
    for (const name of ['mcp__docs__a', 'mcp__docs__b', 'mcp__fixed__a']) ctx.tools.register(tool(name))
    surface.ready(dynamic); surface.ready(fixed)
    for (const agent of [first, second]) await call(ctx, 'mcp_tool_search', { query: 'docs', limit: 2 }, agent)
    expect((await call(ctx, 'mcp_tool_release', { names: ['mcp__docs__a', 'bad name'] })).isError).toBe(true)
    expect((await call(ctx, 'mcp_tool_release', { names: [] })).isError).toBe(true)
    expect((await call(ctx, 'mcp_tool_release', { names: Array(513).fill('mcp__docs__a') })).isError).toBe(true)
    expect((await call(ctx, 'mcp_tool_release', { names: Array(512).fill('x'.repeat(64)) })).isError).toBe(true)
    expect((await call(ctx, 'mcp_tool_release', { names: ['mcp__docs__a', 'mcp__docs__a', 'mcp__fixed__a', 'ordinary'] })).value).toMatchObject({
      releasedNames: ['mcp__docs__a'], ignoredNames: ['mcp__fixed__a', 'ordinary'],
    })
    expect((await call(ctx, 'mcp_tool_release', { names: ['mcp__docs__a'] })).value).toMatchObject({ releasedNames: [] })
    expect((await ctx.systemPrompt.assemble({ scope: second, agent: second })).tools.map(t => t.name)).toContain('mcp__docs__a')
    expect((await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.map(t => t.name)).toEqual(['mcp__docs__b', 'mcp__fixed__a', 'mcp_tool_release', 'mcp_tool_search'])
    expect(surface.status('docs').discoveredToolCount).toBe(2)
    expect((await call(ctx, 'mcp_tool_search', { query: 'mcp__docs__a', limit: 1 })).value).toMatchObject({ loadedNames: ['mcp__docs__a'] })
    await call(ctx, 'mcp_tool_release', { names: ['mcp__docs__a'] })
    expect((await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.map(t => t.name)).not.toContain('mcp__docs__a')
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
    await ctx.systemPrompt.assemble({ scope: first, agent: first })
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
    await ctx.systemPrompt.assemble({ scope: first, agent: first })
    expect((await call(ctx, 'mcp__docs__read')).isError).toBeFalsy()
    fresh = false
    expect((await call(ctx, 'mcp__docs__read')).isError).toBe(true)
    fresh = true
    surface.revoke(connection)
    expect((await call(ctx, 'mcp__docs__read')).isError).toBe(true)
    expect((await ctx.systemPrompt.assemble({ scope: first, agent: first })).tools.map(value => value.name)).not.toContain('mcp__docs__read')
  })

  it('rejects control-tool conflicts without leaving a partial registration', async () => {
    const ctx = await host()
    const existing = tool('mcp_tool_release')
    ctx.tools.register(existing)
    expect(() => mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })).toThrow('MCP_NAMESPACE_CONFLICT')
    expect(ctx.tools.get('mcp_tool_search')).toBeUndefined()
    expect(ctx.tools.get('mcp_tool_release')).toBe(existing)
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
    await ctx.systemPrompt.assemble({ scope: first, agent: first })
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
    const settings = { update: vi.fn(async () => undefined) }
    ctx.provide('settings', settings as never)
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
    await ctx.systemPrompt.assemble({ scope: first, agent: first })
    expect((await call(ctx, 'mcp__docs__read')).isError).toBeFalsy()
    expect(methods.filter(value => value === 'tools/call')).toHaveLength(1)
    expect(platform.request).toHaveBeenCalledTimes(1)
    const pause = await fetch(`${localUrl}/enterprise/api/v1/local/mcp/pause`, { method: 'POST', body: JSON.stringify({ serverName: 'docs' }) })
    expect(pause.status).toBe(200)
    const settingNamespaces = settings.update.mock.calls.map(call => call[0])
    expect(settingNamespaces).toContain('owndsh')
    expect(settingNamespaces).not.toContain('owndsh-plugin')
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
    await ctx.systemPrompt.assemble({ scope: first, agent: first })
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

  it('uses the official OAuth Client for negotiation, paginated tools, and URI resources', async () => {
    const requests: Array<{ body: any; authorization: string | undefined }> = []
    const url = await listen(async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405).end(); return }
      const body = await json(request)
      requests.push({ body, authorization: request.headers.authorization })
      if (body.id === undefined) { response.writeHead(202).end(); return }
      const result = body.method === 'initialize' ? {
        protocolVersion: '2025-03-26', capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'official-oauth-fixture', version: '1' }, instructions: 'Use the official MCP client.',
      } : body.method === 'tools/list' && body.params?.cursor === undefined ? {
        tools: [{ name: 'read', description: 'read docs', inputSchema: { type: 'object', properties: {} } }], nextCursor: 'page-2',
      } : body.method === 'tools/list' ? {
        tools: [{ name: 'write', description: 'write docs', inputSchema: { type: 'object', properties: {} } }],
      } : body.method === 'resources/list' ? {
        resources: [{ uri: 'mcp://docs/readme', name: 'readme', mimeType: 'text/plain' }],
      } : body.method === 'resources/templates/list' ? {
        resourceTemplates: [{ uriTemplate: 'mcp://docs/{path}', name: 'document' }],
      } : body.method === 'resources/read' ? {
        contents: [{ uri: body.params.uri, mimeType: 'text/plain', text: 'resource body' }],
      } : body.method === 'tools/call' ? {
        content: [{ type: 'text', text: 'tool result' }],
      } : {}
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }))
    })
    const ctx = await host(), routes = new Map<string, any>(), records = new Map<any, any>()
    const credentials = {
      readRecord: async (key: any) => structuredClone(records.get(key)),
      modifyRecord: async (key: any, mutate: any) => { const next = await mutate(structuredClone(records.get(key))); if (next !== undefined) records.set(key, next); return records.get(key) },
      deleteRecord: async (key: any) => { records.delete(key) },
      listRecords: async () => [...records].map(([key, record]) => ({ key, kind: record.kind })),
    }
    let resourceProvider: any
    ctx.provide('webServer', { register: (route: any) => { routes.set(route.path, route); return () => routes.delete(route.path) } })
    ctx.provide('mcpResources', { register: (_server: string, provider: any) => { resourceProvider = provider; return () => { resourceProvider = undefined } } })
    ctx.tools.register(tool('ordinary'))
    const assignment = { id: '3', serverName: 'docs', displayName: 'Docs', revision: 1, url,
      transport: 'streamable-http', headers: { 'X-Client-Name': 'OwnDsh' }, presentation: 'search',
      auth: { type: 'oauth', clientId: 'client', resource: url }, reconnect: { enabled: false } }
    const ownerDigest = mcpOwnerDigest({ platformUrl: 'https://platform.example', userId: '1', deviceId: '2', installationId: 'installation-a' })
    const seed = new McpCredentialManager(credentials as any, mcpCredentialBinding(ownerDigest, assignment))
    await seed.saveClientInformation({ client_id: 'client', issuer: url }, { issuer: url })
    await seed.saveTokens({ access_token: 'access', refresh_token: 'refresh', token_type: 'Bearer', expires_in: 3600, issuer: url }, { issuer: url })
    await seed.dispose()
    const platform = {
      status: () => ({ state: 'READY', platformUrl: 'https://platform.example' }),
      bootstrap: () => ({ user: { id: '1' }, device: { id: '2', installationId: 'installation-a' } }),
      subscribe: () => () => {},
      request: vi.fn(async () => Response.json({ data: { revision: 1, validForMs: 60000, assignments: [assignment] } })),
    }
    const fiber = await ctx.plugin({ inject: ['tools', 'webServer'], apply: (child: Context) => { mountMcpRuntime(child as any, platform as any, credentials as any) } })
    await vi.waitFor(() => expect(ctx.tools.get('mcp__docs__read')).toBeDefined())
    expect(ctx.tools.get('mcp__docs__write')).toBeDefined()
    expect(requests.every(request => request.authorization === 'Bearer access')).toBe(true)
    expect(requests.filter(request => request.body.method === 'tools/list')).toHaveLength(2)
    expect((await ctx.systemPrompt.assemble({ scope: first, agent: first })).sections.map(section => section.text).join('\n')).toContain('Use the official MCP client.')
    expect((await call(ctx, 'mcp_tool_search', { query: 'read' })).isError).toBe(false)
    await ctx.systemPrompt.assemble({ scope: first, agent: first })
    expect((await call(ctx, 'mcp__docs__read')).isError).toBe(false)
    expect(resourceProvider).toBeDefined()
    const execution = { signal: new AbortController().signal } as any
    await expect(resourceProvider.request({ method: 'resources/list' }, execution)).resolves.toMatchObject({ resources: [{ uri: 'mcp://docs/readme' }] })
    await expect(resourceProvider.request({ method: 'resources/templates/list' }, execution)).resolves.toMatchObject({ resourceTemplates: [{ uriTemplate: 'mcp://docs/{path}' }] })
    await expect(resourceProvider.request({ method: 'resources/read', uri: 'mcp://docs/readme' }, execution)).resolves.toMatchObject({ contents: [{ text: 'resource body' }] })
    await fiber.dispose()
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

    if (action === 'disconnect') {
      expect((await local('disconnect', { serverName: 'docs' })).status).toBe(200)
    } else if (action === 'account-switch') {
      userId = '9'
      listener()
      await vi.waitFor(() => expect(records.size).toBe(0))
    } else {
      await fiber.dispose()
    }
    await vi.waitFor(() => expect(ctx.tools.get('mcp__docs__read')).toBeUndefined())
    if (action === 'disconnect') expect(records.size).toBe(0)
    await fiber.dispose()
  }, 15_000)

})
