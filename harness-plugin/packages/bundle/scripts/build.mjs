/**
 * [INPUT]: 依赖 esbuild、TypeScript CLI、bundle Host 入口和 dsh-ui Client 源入口
 * [OUTPUT]: 生成自包含 Host ESM、官方 lazy-CJS Client factory、声明与 sourcemap
 * [POS]: bundle 的发布构建器，把 workspace 构建依赖消化进 tgz 而不留下运行 dependencies
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { execFileSync } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LIB_ROOT = resolve(PACKAGE_ROOT, 'lib')
const CLIENT_MODULE_ID = '@enterprise-agent/dsh-bundle'

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
  external: ['@deepseek-ai/cordis'],
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
  external: ['react'],
  footer: { js: 'return module.exports } })' },
  format: 'cjs',
  outfile: 'lib/client.js',
  platform: 'browser',
  sourcemap: true,
  target: ['chrome120', 'safari17'],
})
