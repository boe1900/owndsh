/**
 * [INPUT]: 依赖 bundle manifest/Config/patch、构建产物和 Node vm 中的官方 React lazy-CJS seed 模型
 * [OUTPUT]: 验证安装配置、dsh.bundle/dsh.client、credentials/pi-ai/分发注入、兼容 peers 与仅设置/门禁的 Client apply
 * [POS]: bundle 发布不变量测试，拒绝 Typert ambient shim、Harness 源码路径和未打包运行依赖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import * as React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import { describe, expect, it, vi } from 'vitest'
import { Config, inject } from '../src/index.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('enterprise bundle', () => {
  it('declares the official bundle and Client module manifests', async () => {
    const manifest = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8')) as Record<string, any>
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.client).toMatchObject({ platform: 'web' })
    expect(manifest.dsh.client.inject).toEqual([
      '@deepseek-ai/dsh-api-remotes',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-store',
      '@deepseek-ai/dsh-client-ui-layout',
      '@deepseek-ai/dsh-client-ui-renderer',
      '@deepseek-ai/dsh-client-ui-settings',
      '@deepseek-ai/dsh-client-ui-settings-general',
      '@deepseek-ai/dsh-client-ui-sidebar',
      '@deepseek-ai/dsh-client-ui-slots',
    ])
    expect(manifest.dependencies).toEqual({ '@orama/orama': '3.1.18' })
    expect(manifest.peerDependencies['@deepseek-ai/dsh-llm']).toBe('^0.1.7-rc.1')
    expect(manifest.peerDependencies['@deepseek-ai/dsh-credentials']).toBe('^0.1.7-rc.1')
    expect(manifest.peerDependencies['@deepseek-ai/dsh-llm-pi-ai']).toBe('^0.1.7-rc.1')
    expect(manifest.peerDependencies['@deepseek-ai/dsh-session']).toBeUndefined()
    expect(manifest.peerDependencies['@deepseek-ai/dsh-subprocess']).toBe('^0.1.7-rc.1')
    expect(manifest.peerDependencies['@deepseek-ai/dsh-host-plugin-inventory']).toBe('^0.1.7-rc.1')
    expect(manifest.peerDependencies['@deepseek-ai/dsh-plugin-manager']).toBe('^0.1.7-rc.1')
    expect(manifest.peerDependencies['@deepseek-ai/dsh-mcp-client']).toBe('^0.1.7-rc.1')
    expect(manifest.peerDependencies['@deepseek-ai/dsh-tools']).toBe('^0.1.7-rc.1')
    expect(manifest.peerDependencies['@deepseek-ai/schemastery']).toBe('^3.18.4')
    expect(inject).toEqual([
      'webServer', 'credentials', 'settings', 'llm', 'pluginInventory', 'pluginManager', 'tools',
    ])
    expect(Config({
      baseUrl: 'https://enterprise.example.com',
    })).toMatchObject({
      requestTimeoutMs: 30_000,
      disposeTimeoutMs: 3_000,
    })
    const defaultConfig = Config({})
    expect((defaultConfig.baseUrl as unknown as { get(): string }).get()).toBe('')
    const patch = await readFile(resolve(ROOT, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain("name: 'owndsh-plugin'")
    expect(patch).toMatch(/id: agent-default-model[\s\S]*provider: enterprise[\s\S]*model: enterprise\/default/)
    for (const id of ['llm-deepseek', 'llm-pi-ai', 'ui-settings-models', 'ui-plugin-manager']) {
      expect(patch).toMatch(new RegExp(`id: ${id}\\n  disabled: true`))
    }
    expect(patch).not.toContain('id: mcp-resources')
    expect(patch).not.toContain('deepseek-harness')
    const source = await readFile(resolve(ROOT, 'src/index.ts'), 'utf8')
    expect(source).toContain('const HARNESS_VERSION = APP_IDENTITY.version')
    expect(source).toContain("createRequire(import.meta.url)('../package.json')")
    expect(source).not.toContain("const HARNESS_VERSION = '0.1.1-rc.2'")
  })

  it('materializes the built lazy-CJS Client factory and registers the official page plus OwnDsh slots', async () => {
    const source = await readFile(resolve(ROOT, 'lib/client.js'), 'utf8')
    expect(source).toContain("id: 'owndsh-plugin'")
    expect(source).not.toContain('@deepseek-ai/dsh-typert-protocol')
    let factory: ((require: (id: string) => unknown) => Record<string, unknown>) | undefined
    runInNewContext(source, {
      AbortController,
      DOMException,
      fetch,
      window: {
        __ModuleLoader__: {
          load(record: { factory: typeof factory }) { factory = record.factory },
        },
      },
    })
    const nodeRequire = createRequire(import.meta.url)
    const client = factory?.((id) => {
      if (id === 'react') return React
      if (id === 'react/jsx-runtime') return ReactJsxRuntime
      if (id === '@deepseek-ai/dsh-client-ui-primitives') return { Modal: vi.fn(), Button: vi.fn() }
      return nodeRequire(id)
    }) as { apply?: (ctx: unknown) => void } | undefined
    expect(client?.apply).toBeTypeOf('function')
    const register = vi.fn((_options: { name: string }) => () => undefined)
    const locale = { register: () => undefined, bind: () => (key: string) => key, resolveText: (value: unknown) => String(value), getSnapshot: () => ({ revision: 0 }), subscribe: () => () => undefined }
    const slots = { inject: (_name: string, callback: () => unknown) => callback(), register, entries: () => [], getVersion: () => 0, subscribe: () => () => undefined }
    client?.apply?.({ effect: (effect: () => unknown) => effect(), slots, locale,
      remote: { $on: () => () => undefined }, on: () => () => undefined,
      configForms: { describe: () => ({ view: { namespaces: [] } }), get: () => undefined } })
    expect(register.mock.calls.map(call => call[0].name)).toEqual(['main', 'sidebar.panellist', 'shell.overlay', 'settings.section', 'shell.overlay'])
    expect(source).toContain("data-plugin-css=\"' + id + '\"")
  })

  it('contains no ambient Remote shim or sibling source import', async () => {
    const files = [
      resolve(ROOT, 'src/index.ts'),
      resolve(ROOT, 'lib/index.js'),
      resolve(ROOT, 'lib/client.js'),
    ]
    const combined = (await Promise.all(files.map(path => readFile(path, 'utf8')))).join('\n')
    expect(combined).not.toMatch(/declare module ['"]@deepseek-ai\/dsh-typert-protocol/)
    expect(combined).not.toContain('/deepseek-harness/')
    expect(combined).not.toContain('../deepseek-harness')
    expect(combined).toContain("from '@deepseek-ai/dsh-llm'")
    expect(combined).toMatch(/from ["']@deepseek-ai\/dsh-credentials["']/)
    expect(combined).toMatch(/from ["']@deepseek-ai\/dsh-llm-pi-ai["']/)
    expect(combined).not.toContain("from '@deepseek-ai/dsh-session'")
    expect(combined).toContain("from '@deepseek-ai/schemastery'")
    expect(combined).not.toContain('enterprisePluginDistribution')
    expect(combined).toContain('removeBundle("owndsh-plugin")')
    expect(combined).not.toContain('enterpriseSessionSync')
    expect(combined).not.toContain('ENT_PLUGIN_CORE_PROTECTED')
    expect(combined).toContain('require("@deepseek-ai/dsh-client-ui-primitives")')
    expect(combined).not.toContain('globalThis.confirm(')
  })
})
