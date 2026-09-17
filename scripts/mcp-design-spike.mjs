/**
 * [INPUT]: 接收已构建 Harness checkout 或 npm 运行树路径，加载其公开 tools/system-prompt/Cordis API。
 * [OUTPUT]: 验证 MCP 设计依赖的呈现过滤、会话隔离、执行 guard 与 SDK 重渲染行为。
 * [POS]: scripts 的无网络设计探针；不实现 MCP，不修改宿主配置，不调用 LLM。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const harness = process.argv[2];
assert(harness, 'Usage: node scripts/mcp-design-spike.mjs /absolute/path/to/deepseek-harness');
const toolsPackage = resolve(harness, 'packages/core/tools/package.json');
const requireHarness = createRequire(existsSync(toolsPackage) ? toolsPackage : resolve(harness, 'package.json'));
const load = name => import(pathToFileURL(requireHarness.resolve(name)).href);
const { Context } = await load('@deepseek-ai/cordis');
const { default: SystemPrompt, renderPrompt } = await load('@deepseek-ai/dsh-system-prompt');
const { default: ToolRuntime, renderToolsSdk, renderToolsSdkPy } = await load('@deepseek-ai/dsh-tools');
const { default: CodeRuntime } = await load('@deepseek-ai/dsh-code-runtime');
const version = requireHarness('@deepseek-ai/dsh-tools/package.json').version;
assert(['0.1.1-rc.2', '0.1.5-rc.2'].includes(version), 'Verify the public presentation API before probing a new Harness version');
const codeMode = version === '0.1.1-rc.2' ? 'code' : 'ptc';
const findings = [];

// ---- 真实注册表，隔离的运行时实例 ----
for (const mode of ['native', codeMode, 'both']) {
  const ctx = new Context();
  try {
    await ctx.plugin(SystemPrompt);
    if (mode !== 'native') {
      await ctx.plugin(class extends CodeRuntime {
        language = 'typescript';
        isolation = 'design-probe';
        run() { throw new Error('This probe does not execute programs'); }
      });
    }
    await ctx.plugin(ToolRuntime, { mode });
    const first = { id: 'design-session-a' };
    const second = { id: 'design-session-b' };
    const active = new WeakMap([[first, new Set()], [second, new Set()]]);
    let calls = 0;
    for (const name of ['mcp_tool_search', 'mcp__design__read']) {
      ctx.tools.register({
        name, description: name === 'mcp_tool_search' ? name : 'literal {{remote_marker}}',
        parameters: { type: 'object', properties: {} },
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        execute: async () => { calls++; return 'ok'; },
      });
    }
    const before = await ctx.systemPrompt.assemble({ scope: first, agent: first });
    if (mode !== 'native') {
      assert(before.sections.find(s => s.name === 'tools:sdk').text.includes('mcp__design__read'));
    }
    ctx.on('system-prompt/assemble', (assembly, context, next) => {
      const visible = schema => !schema.name.startsWith('mcp__')
        || active.get(context.agent)?.has(schema.name);
      assembly.tools = assembly.tools.filter(visible);
      const sdk = assembly.sections.find(s => s.name === 'tools:sdk');
      if (sdk) {
        const schemas = ctx.tools.schemas(context.scope)
          .filter(schema => schema.name !== 'run_code' && visible(schema))
          .map(schema => ({ ...schema, output: ctx.tools.get(schema.name, context.scope).output.schema }));
        assembly.variables.owndsh_mcp_sdk = renderToolsSdk(schemas);
        sdk.text = '{{owndsh_mcp_sdk}}';
        assert(!renderToolsSdkPy(schemas).includes('mcp__design__read')
          || active.get(context.agent)?.has('mcp__design__read'));
      }
      return next();
    });
    const cold = await ctx.systemPrompt.assemble({ scope: first, agent: first });
    assert(!JSON.stringify(cold).includes('mcp__design__read'));
    assert(ctx.tools.get('mcp__design__read', first), 'Presentation must preserve registry lookup');
    active.get(first).add('mcp__design__read');
    const hot = await ctx.systemPrompt.assemble({ scope: first, agent: first });
    assert(JSON.stringify(hot).includes('mcp__design__read'));
    if (mode !== 'native') assert(renderPrompt(hot).includes('{{remote_marker}}'));
    const other = await ctx.systemPrompt.assemble({ scope: second, agent: second });
    assert(!JSON.stringify(other).includes('mcp__design__read'));
    if (mode === 'native') {
      const disposeGuard = ctx.tools.guard(exec => exec.name === 'mcp__design__read' ? 'design denial' : undefined);
      const result = await ctx.tools.execute({
        callId: 'design-call', name: 'mcp__design__read', arguments: {},
        agent: first, signal: new AbortController().signal,
      });
      assert(result.isError);
      assert.equal(calls, 0, 'Guard must deny before any body side effect');
      disposeGuard();
      const allowed = await ctx.tools.execute({
        callId: 'design-allowed', name: 'mcp__design__read', arguments: {},
        agent: first, signal: new AbortController().signal,
      });
      assert(!allowed.isError);
      assert.equal(calls, 1);
    }
    findings.push({ mode, sessionIsolation: true, schemaAndSdkFiltered: true });
  } finally {
    await ctx.fiber.dispose();
  }
}
process.stdout.write(`${JSON.stringify({ harnessVersion: version, findings }, null, 2)}\n`);
