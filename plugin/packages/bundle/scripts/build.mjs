/**
 * [INPUT]: 依赖 esbuild、TypeScript CLI、bundle Host、Harness peers、共享 UI primitives 与 UI Client
 * [OUTPUT]: 生成内联产品包且保留全部官方运行时单例的 Host ESM、lazy-CJS Client、声明与 sourcemap
 * [POS]: bundle 的发布构建器，消化产品 workspace 依赖并保持 Harness 核心类由目标 profile 提供
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LIB_ROOT = resolve(PACKAGE_ROOT, 'lib')
const CLIENT_MODULE_ID = 'owndsh-plugin'

await rm(LIB_ROOT, { force: true, recursive: true })
await mkdir(LIB_ROOT, { recursive: true })

execFileSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json'], {
  cwd: PACKAGE_ROOT,
  stdio: 'inherit',
})

await build({
  absWorkingDir: PACKAGE_ROOT,
  bundle: true,
  entryPoints: ['src/index.ts'],
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-credentials',
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-llm-pi-ai',
    '@deepseek-ai/dsh-mcp-client',
    '@deepseek-ai/dsh-mcp-resources',
    '@modelcontextprotocol/client',
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-settings',
    '@deepseek-ai/schemastery',
  ],
  format: 'esm',
  outfile: 'lib/index.js',
  platform: 'node',
  sourcemap: true,
  target: 'node22',
})

await build({
  absWorkingDir: PACKAGE_ROOT,
  banner: {
    js: `window.__ModuleLoader__.load({ id: '${CLIENT_MODULE_ID}', factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  },
  bundle: true,
  entryPoints: ['../ui/src/client.tsx'],
  external: [
    'react', 'react-dom',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-api-remotes',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-store',
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-ui-renderer',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-sidebar',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-package-manifest',
  ],
  footer: { js: 'return module.exports } })' },
  format: 'cjs',
  outfile: 'lib/client.js',
  platform: 'browser',
  sourcemap: true,
  target: ['chrome120', 'safari17'],
})

// The Host loads one lazy-CJS file. Inline the CSS emitted by esbuild so the
// published bundle cannot silently omit the page's module stylesheet.
const clientPath = resolve(LIB_ROOT, 'client.js')
const clientCssPath = resolve(LIB_ROOT, 'client.css')
const clientCss = (await readFile(clientCssPath, 'utf8')).replace(/\n?\/\*# sourceMappingURL=.*\*\/\s*$/, '')
const cssInjection = `;(() => { if (typeof document === 'undefined') return; const id = 'owndsh-plugin-client'; if (document.querySelector('style[data-plugin-css="' + id + '"]') !== null) return; const style = document.createElement('style'); style.dataset.pluginCss = id; style.textContent = ${JSON.stringify(clientCss)}; (document.head ?? document.documentElement).appendChild(style) })()\n`
await writeFile(clientPath, cssInjection + await readFile(clientPath, 'utf8'))
await rm(clientCssPath, { force: true })
await rm(`${clientCssPath}.map`, { force: true })
