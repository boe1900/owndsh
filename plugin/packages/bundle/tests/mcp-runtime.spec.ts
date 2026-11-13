/**
 * [INPUT]: 依赖真实 Cordis/tools/systemPrompt 与受控 PTC binding。
 * [OUTPUT]: 验证 Pi 风格曝光、英文 tool_search、Agent 隔离、下一轮 assembly，以及未声明与实时失效的拒执行分类。
 * [POS]: bundle MCP 工具表面回归；OAuth/transport 由官方 client 与独立 OAuth 测试覆盖。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createScope } from '@deepseek-ai/dsh-scope'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, { defineTool, type ResolvedToolSet, type ToolDefinition, type ToolExecution } from '@deepseek-ai/dsh-tools'
import * as NativeExecutor from '@deepseek-ai/dsh-tool-executor-native'
import * as PtcExecutor from '@deepseek-ai/dsh-tool-executor-ptc'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import PtcRuntime, { type PtcRunRequest, type PtcRunSpec } from '@deepseek-ai/dsh-ptc-runtime'
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountMcpTools, publicMcpToolName } from '../src/mcp-tools.js'

const disposals: Array<() => unknown> = []
afterEach(async () => { for (const dispose of disposals.splice(0).reverse()) await dispose() })
const first = { id: 'first', session: { header: {}, append() {} } } as any
const second = { id: 'second', session: { header: {}, append() {} } } as any
const admitted = new WeakMap<object, ResolvedToolSet>()
async function assemble(ctx: Context, agent = first) {
  admitted.get(agent)?.dispose()
  const toolSet = await ctx.tools.resolve({ agent, modelSelection: { provider: 'test', model: 'test' }, signal: new AbortController().signal })
  admitted.set(agent, toolSet)
  return ctx.systemPrompt.assemble({ scope: agent, agent, toolSet })
}
const tool = (name: string, description = name): ToolDefinition => defineTool({
  name, description, parameters: {},
  output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
  execute: vi.fn(async () => 'done'),
})

async function host(mode: 'native' | 'ptc' = 'native', language = 'typescript', runtimePresent = mode !== 'native', format: 'function-body' | 'repl' | 'script' = 'function-body') {
  const ctx = new Context()
  disposals.push(() => ctx.fiber.dispose())
  first.ctx = ctx
  second.ctx = ctx
  ctx.provide('workingDirectory', {
    defaultDirectory: process.cwd(),
    get: (session: any) => session.header?.cwd ?? process.cwd(),
    ensure: async (agent: any) => agent.session.header?.cwd ?? process.cwd(),
  })
  await ctx.plugin(SystemPrompt)
  if (runtimePresent) await ctx.plugin(class extends PtcRuntime {
    language = language
    override get programFormat() { return format }
    isolation = 'test-controlled-binding-dispatch'
    resolve(request: PtcRunRequest): PtcRunSpec { return { ...request, cwd: request.cwd ?? process.cwd(), timeoutMs: request.timeoutMs ?? 60_000 } }
    async run(request: PtcRunSpec) {
      const { name, args } = JSON.parse(request.program)
      try { return { value: await request.bindings.find(value => value.global === 'tools')!.functions[name]!(args), logs: [] } }
      catch { return { logs: [], error: { kind: 'exception' as const, message: 'binding rejected' } } }
    }
  })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(mode === 'native' ? NativeExecutor : PtcExecutor)
  return ctx
}

async function call(ctx: Context, name: string, args: unknown = {}, agent = first, ptc = false) {
  const batch = await ctx.tools.execute({ calls: [{ type: 'tool-call', id: 'test-call' as any, name: ptc ? 'run_code' : name,
    arguments: ptc ? { code: JSON.stringify({ name, args }), description: 'Test controlled binding' } : args }],
    agent, signal: new AbortController().signal, toolSet: admitted.get(agent) })
  return batch.results[0]!.result
}

describe('MCP exposure and discovery', () => {
  it.each([
    { mode: 'native', exposure: 'direct' },
    { mode: 'native', exposure: 'deferred' },
    { mode: 'ptc', exposure: 'codemode' },
  ] as const)('refreshes an idle lease within the same $mode/$exposure step and still fences a failed refresh', async ({ mode, exposure }) => {
    const ctx = await host(mode)
    let fresh = true
    let renewable = true
    const surface = mountMcpTools(ctx, { fresh: () => fresh, refresh: async () => {
      fresh = renewable
      if (renewable) connection.expiresAt = Date.now() + 60_000
    } })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', { exposure })
    const read = tool('mcp__docs__read', 'Read a financial report')
    const execute = vi.spyOn(read, 'execute')
    surface.register(read)
    surface.ready(connection)
    await assemble(ctx)
    if (exposure !== 'direct') {
      await call(ctx, 'tool_search', { query: 'financial report' }, first, mode === 'ptc')
      await assemble(ctx)
    }

    fresh = false
    connection.expiresAt = Date.now() - 1
    const recovered = await assemble(ctx)
    expect(fresh).toBe(true)
    if (mode === 'native') expect(recovered.tools.map(value => value.name)).toContain('mcp__docs__read')
    else expect(recovered.sections.find(section => section.name === 'tools:sdk')?.text).toContain('mcp__docs__read')
    expect((await call(ctx, 'mcp__docs__read', {}, first, mode === 'ptc')).isError).toBe(false)
    expect(execute).toHaveBeenCalledTimes(1)

    renewable = false
    fresh = false
    await assemble(ctx)
    expect((await call(ctx, 'mcp__docs__read', {}, first, mode === 'ptc')).isError).toBe(true)
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it('defaults native servers to deferred and applies search on the next assembly', async () => {
    const ctx = await host()
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs')
    const read = tool('mcp__docs__read_report', 'Read a financial report')
    const execute = vi.spyOn(read, 'execute')
    surface.register(read)
    surface.ready(connection)

    const cold = await assemble(ctx)
    expect(cold.tools.map(value => value.name)).toContain('tool_search')
    expect(cold.tools.map(value => value.name)).not.toContain('mcp__docs__read_report')
    expect((await call(ctx, 'tool_search', { query: 'financial report' })).value).toMatchObject({ loaded: ['mcp__docs__read_report'] })
    const blocked = await call(ctx, 'mcp__docs__read_report')
    expect(blocked).toMatchObject({ isError: true, content: [{ type: 'text', text: expect.stringContaining('MCP_TOOL_NOT_LOADED') }] })
    expect(execute).not.toHaveBeenCalled()

    const hot = await assemble(ctx)
    expect(hot.tools.map(value => value.name)).toContain('mcp__docs__read_report')
    expect((await call(ctx, 'mcp__docs__read_report')).isError).toBe(false)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('keeps a same-schema replacement during refresh classified as a generation change', async () => {
    const ctx = await host()
    let replace = false
    let unregister = () => {}
    const read = tool('mcp__docs__read_report', 'Read a financial report')
    const replacement = tool(read.name, read.description)
    const execute = vi.spyOn(read, 'execute')
    const executeReplacement = vi.spyOn(replacement, 'execute')
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {
      if (!replace) return
      replace = false
      unregister()
      surface.register(replacement)
    } })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', { exposure: 'direct' })
    unregister = surface.register(read)
    surface.ready(connection)
    await assemble(ctx)
    replace = true

    const blocked = await call(ctx, read.name)
    expect(blocked).toMatchObject({ isError: true, content: [{ type: 'text', text: expect.stringContaining('MCP_GENERATION_CHANGED') }] })
    expect(execute).not.toHaveBeenCalled()
    expect(executeReplacement).not.toHaveBeenCalled()
    await assemble(ctx)
    expect((await call(ctx, read.name)).isError).toBe(false)
    expect(executeReplacement).toHaveBeenCalledTimes(1)
  })

  it('temporarily suspends a dropped connection without poisoning its abort signal', async () => {
    const ctx = await host()
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', { exposure: 'direct' })
    surface.register(tool('mcp__docs__read_report'))
    surface.ready(connection)
    expect((await assemble(ctx)).tools.map(value => value.name))
      .toContain('mcp__docs__read_report')

    surface.suspend(connection)
    expect(connection.abort.signal.aborted).toBe(false)
    expect((await assemble(ctx)).tools.map(value => value.name))
      .not.toContain('mcp__docs__read_report')

    surface.ready(connection)
    expect((await assemble(ctx)).tools.map(value => value.name))
      .toContain('mcp__docs__read_report')
  })

  it('keeps selection isolated per Agent and removes hidden tools from the native surface', async () => {
    const ctx = await host('native')
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const direct = surface.begin('direct', 'Direct', { exposure: 'direct' })
    const hidden = surface.begin('hidden', 'Hidden', { exposure: 'hidden' })
    const deferred = surface.begin('deferred', 'Deferred', { exposure: 'deferred' })
    for (const name of ['mcp__direct__read', 'mcp__hidden__read', 'mcp__deferred__read']) surface.register(tool(name))
    surface.ready(direct); surface.ready(hidden); surface.ready(deferred)
    const cold = await assemble(ctx)
    expect(cold.tools.map(value => value.name)).toEqual(expect.arrayContaining(['mcp__direct__read', 'tool_search']))
    expect(cold.tools.map(value => value.name)).not.toContain('mcp__hidden__read')
    expect(cold.tools.map(value => value.name)).not.toContain('mcp__deferred__read')
    await call(ctx, 'tool_search', { query: 'deferred read' }, first)
    const other = await assemble(ctx, second)
    expect(other.tools.map(value => value.name)).not.toContain('mcp__deferred__read')
    const next = await assemble(ctx)
    expect(next.tools.map(value => value.name)).toContain('mcp__deferred__read')
    expect((await call(ctx, 'mcp__hidden__read', {}, first)).isError).toBe(true)
  })

  it('uses codemode through PTC and exposes the discovered SDK on the next assembly', async () => {
    const ctx = await host('ptc')
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', { exposure: 'codemode' })
    surface.register(tool('mcp__docs__create_issue', 'Create an issue'))
    surface.ready(connection)
    const cold = await assemble(ctx)
    expect(cold.tools.map(value => value.name)).toEqual(['run_code'])
    expect(cold.sections.find(section => section.name === 'tools:sdk')?.text).not.toContain('mcp__docs__create_issue')
    expect((await call(ctx, 'tool_search', { query: 'create issue' }, first, true)).isError).toBe(false)
    const hot = await assemble(ctx)
    expect(hot.tools.map(value => value.name)).toEqual(['run_code'])
    expect(hot.sections.find(section => section.name === 'tools:sdk')?.text).toContain('mcp__docs__create_issue')
    expect((await call(ctx, 'mcp__docs__create_issue')).isError).toBe(true)
    expect((await call(ctx, 'mcp__docs__create_issue', {}, first, true)).isError).toBe(false)
  })

  it('passes MCP structuredContent through PTC with its advertised output shape', async () => {
    const ctx = await host('ptc')
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', { exposure: 'codemode' })
    const name = publicMcpToolName('docs', 'lookup_user')
    surface.register(createMcpToolDefinition(ctx, {
      name,
      rawName: 'lookup_user',
      description: 'Look up a user',
      inputSchema: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] },
      outputSchema: {
        type: 'object',
        properties: { id: { type: 'string' }, status: { type: 'string' } },
        required: ['id', 'status'],
        additionalProperties: false,
      },
      call: async () => ({
        content: [{ type: 'text', text: 'user found' }],
        structuredContent: { id: 'user-1', status: 'ready' },
      }),
    }))
    surface.ready(connection)

    await assemble(ctx)
    expect((await call(ctx, 'tool_search', { query: 'look up user' }, first, true)).isError).toBe(false)
    const assembly = await assemble(ctx)
    expect(assembly.sections.find(section => section.name === 'tools:sdk')?.text).toContain('structuredContent')
    expect(assembly.sections.find(section => section.name === 'tools:sdk')?.text).toContain('status')

    const result = await call(ctx, name, { email: 'user@example.com' }, first, true)
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({
      result: { structuredContent: { id: 'user-1', status: 'ready' } },
    })
  })

  it('keeps deferred bindings callable by name before discovery in ptc mode', async () => {
    const ctx = await host('ptc')
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', { exposure: 'deferred' })
    surface.register(tool('mcp__docs__read_report', 'Read a financial report'))
    surface.ready(connection)
    const cold = await assemble(ctx)
    expect(cold.tools.map(value => value.name)).not.toContain('mcp__docs__read_report')
    expect((await call(ctx, 'mcp__docs__read_report', {}, first, true)).isError).toBe(false)
    expect((await call(ctx, 'tool_search', { query: 'financial report' }, first, true)).isError).toBe(false)
    const hot = await assemble(ctx)
    expect(hot.sections.find(section => section.name === 'tools:sdk')?.text).toContain('mcp__docs__read_report')
    expect((await call(ctx, 'mcp__docs__read_report', {}, first, true)).isError).toBe(false)
    expect(hot.tools.map(value => value.name)).not.toContain('mcp__docs__read_report')
  })

  it('keeps codemode native calls denied after discovery in ptc mode', async () => {
    const ctx = await host('ptc')
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', { exposure: 'codemode' })
    surface.register(tool('mcp__docs__create_issue', 'Create an issue'))
    surface.ready(connection)
    await assemble(ctx)
    expect((await call(ctx, 'mcp__docs__create_issue', {}, first, true)).isError).toBe(false)
    await call(ctx, 'tool_search', { query: 'create issue' }, first, true)
    const hot = await assemble(ctx)
    expect(hot.tools.map(value => value.name)).not.toContain('mcp__docs__create_issue')
    expect(hot.sections.find(section => section.name === 'tools:sdk')?.text).toContain('mcp__docs__create_issue')
    expect((await call(ctx, 'mcp__docs__create_issue')).isError).toBe(true)
  })

  it('resolves omitted exposure for a native Agent even when the host has a PTC runtime', async () => {
    const ctx = await host('native', 'typescript', true)
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs')
    surface.register(tool('mcp__docs__read_report', 'Read a financial report'))
    surface.ready(connection)
    await assemble(ctx)
    expect((await call(ctx, 'tool_search', { query: 'financial report' })).value)
      .toMatchObject({ loaded: ['mcp__docs__read_report'] })
    const hot = await assemble(ctx)
    expect(hot.tools.map(value => value.name)).toContain('mcp__docs__read_report')
  })

  it('rejects arbitrary parent tokens as a PTC bypass', async () => {
    const ctx = await host('ptc')
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', { exposure: 'codemode' })
    const definition = tool('mcp__docs__create_issue', 'Create an issue')
    let executed = 0
    definition.execute = async () => { executed += 1; return 'done' }
    surface.register(definition)
    surface.ready(connection)
    await assemble(ctx)
    const pipeline = new ToolExecutionPipeline(ctx)
    const prepared = await pipeline.prepare({ callId: 'spoofed' as any, name: definition.name,
      arguments: {}, agent: first, signal: new AbortController().signal,
      parent: Symbol('foreign-composite') as ToolExecution['token'], toolSet: admitted.get(first) })
    const spoofed = prepared.kind === 'ready' ? await pipeline.dispatch(prepared.exec) : prepared
    expect(spoofed.result.isError).toBe(true)
    expect(executed).toBe(0)
    expect((await call(ctx, definition.name, {}, first, true)).isError).toBe(false)
  })

  it.each([
    ['native', 'typescript'], ['ptc', 'typescript'],
    ['ptc', 'python'],
  ] as const)('projects all four exposures in %s/%s', async (mode, language) => {
    const ctx = await host(mode, language)
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const exposures = ['direct', 'codemode', 'deferred', 'hidden'] as const
    for (const exposure of exposures) {
      const connection = surface.begin(exposure, exposure, { exposure })
      surface.register(tool(`mcp__${exposure}__read`, 'Read a financial report'))
      surface.ready(connection)
    }
    const cold = await assemble(ctx)
    const coldNames = cold.tools.map(value => value.name)
    expect(coldNames.includes('mcp__direct__read')).toBe(mode !== 'ptc')
    for (const exposure of ['codemode', 'deferred', 'hidden']) expect(coldNames).not.toContain(`mcp__${exposure}__read`)
    const coldSdk = cold.sections.find(section => section.name === 'tools:sdk')?.text ?? ''
    expect(coldSdk.includes('mcp__direct__read')).toBe(mode !== 'native')
    for (const exposure of ['codemode', 'deferred', 'hidden']) expect(coldSdk).not.toContain(`mcp__${exposure}__read`)
    for (const exposure of exposures) {
      expect((await call(ctx, `mcp__${exposure}__read`)).isError).toBe(mode === 'ptc' || exposure !== 'direct')
      if (mode !== 'native') expect((await call(ctx, `mcp__${exposure}__read`, {}, first, true)).isError).toBe(exposure === 'hidden')
    }
    await call(ctx, 'tool_search', { query: 'financial report' }, first, mode === 'ptc')
    const hot = await assemble(ctx)
    expect(hot.tools.some(value => value.name === 'mcp__deferred__read')).toBe(mode !== 'ptc')
    expect(hot.tools.some(value => value.name === 'mcp__codemode__read')).toBe(false)
    const hotSdk = hot.sections.find(section => section.name === 'tools:sdk')?.text ?? ''
    expect(hotSdk.includes('mcp__codemode__read')).toBe(mode !== 'native')
    expect(hotSdk.includes('mcp__deferred__read')).toBe(mode !== 'native')
    expect(hotSdk).not.toContain('mcp__hidden__read')
  })

  it('matches tool exposure overrides against raw MCP names', async () => {
    const ctx = await host()
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', { exposure: 'hidden', toolExposure: { 'find/item': 'direct' } })
    surface.register(tool('mcp__docs__find_item', 'Find an item'))
    connection.rawToolNames = new Map([['mcp__docs__find_item', 'find/item']])
    surface.ready(connection)
    const assembly = await assemble(ctx)
    expect(assembly.tools.map(value => value.name)).toContain('mcp__docs__find_item')
    expect((await call(ctx, 'mcp__docs__find_item')).isError).toBe(false)
  })

  it('matches exact raw-name overrides for normalized and truncated official client names', async () => {
    const ctx = await host()
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const rawNames = ['find/item', 'find_' + 'long_name_'.repeat(8)]
    const connection = surface.begin('docs', 'Docs', { exposure: 'hidden',
      toolExposure: Object.fromEntries(rawNames.map(name => [name, 'direct' as const])) })
    for (const name of rawNames) surface.register(tool(publicMcpToolName('docs', name), 'Find an item'))
    surface.ready(connection)
    const assembly = await assemble(ctx)
    for (const name of rawNames) expect(assembly.tools.map(value => value.name)).toContain(publicMcpToolName('docs', name))
  })

  it('invalidates a selected definition when a same-schema replacement is registered', async () => {
    const ctx = await host()
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs')
    const name = 'mcp__docs__read_report'
    const unregister = surface.register(tool(name, 'Read a financial report'))
    surface.ready(connection)
    await assemble(ctx)
    await call(ctx, 'tool_search', { query: 'financial report' })
    await assemble(ctx)
    unregister()
    surface.register(tool(name, 'Read a financial report'))
    const changed = await assemble(ctx)
    expect(changed.tools.map(value => value.name)).not.toContain(name)
    expect((await call(ctx, name)).isError).toBe(true)
  })

  it('rejects expired authorization and aborts in-flight tools on connection revocation', async () => {
    const ctx = await host()
    let fresh = true
    const surface = mountMcpTools(ctx, { fresh: () => fresh, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', { exposure: 'direct' })
    let started!: () => void
    const entered = new Promise<void>(resolve => { started = resolve })
    surface.register(defineTool({
      name: 'mcp__docs__read', description: 'Read report', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute(_args, exec) {
        started()
        return await new Promise<string>((_resolve, reject) => {
          exec.signal.addEventListener('abort', () => reject(new Error('revoked')), { once: true })
        })
      },
    }))
    surface.ready(connection)
    await assemble(ctx)
    fresh = false
    expect((await call(ctx, 'mcp__docs__read')).isError).toBe(true)
    fresh = true
    const pending = call(ctx, 'mcp__docs__read')
    await entered
    surface.revoke(connection)
    expect((await pending).isError).toBe(true)
    expect((await call(ctx, 'mcp__docs__read')).isError).toBe(true)
  })
  it.each(['repl', 'script'] as const)('preserves the official %s SDK while excluding unavailable conditional tools', async format => {
    const ctx = await host('ptc', 'typescript', true, format)
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs', { exposure: 'deferred' })
    surface.register(tool('mcp__docs__read', 'Read a financial report'))
    ctx.tools.register(tool('conditional_unavailable'), { when: () => false })
    surface.ready(connection)
    await assemble(ctx)
    await call(ctx, 'tool_search', { query: 'financial report' }, first, true)
    const hot = await assemble(ctx)
    const sdk = hot.sections.find(section => section.name === 'tools:sdk')?.text
    expect(sdk).toContain('mcp__docs__read')
    expect(sdk).not.toContain('conditional_unavailable')
    expect((await call(ctx, 'mcp__docs__read', {}, first, true)).isError).toBe(false)
  })

  it('probes each resolve once and honors a scoped native executor beside a root PTC executor', async () => {
    const ctx = await host('ptc')
    let probes = 0
    ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
      if (context.agent === undefined) probes++
      return next()
    })
    const surface = mountMcpTools(ctx, { fresh: () => true, refresh: async () => {} })
    disposals.push(() => surface.dispose())
    const connection = surface.begin('docs', 'Docs')
    for (const name of ['read', 'write']) surface.register(tool(`mcp__docs__${name}`, 'Read write financial report'))
    surface.ready(connection)
    const scope = createScope(ctx, second)
    second.ctx = scope.ctx
    await scope.ctx.plugin(NativeExecutor)
    expect((await assemble(ctx, second)).tools.map(tool => tool.name)).toEqual(['tool_search'])
    expect(probes).toBe(1)
    await call(ctx, 'tool_search', { query: 'financial report' }, second)
    expect((await assemble(ctx, second)).tools.map(tool => tool.name)).toContain('mcp__docs__read')
    expect(probes).toBe(2)
    expect((await assemble(ctx)).tools.map(tool => tool.name)).toEqual(['run_code'])
    expect(probes).toBe(3)
    expect((await call(ctx, 'mcp__docs__read', {}, first, true)).isError).toBe(false)
  })

})
