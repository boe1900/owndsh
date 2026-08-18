/**
 * [INPUT]: 依赖 bundle manifest、patch、构建产物和 Node vm 中的官方 React lazy-CJS seed 模型
 * [OUTPUT]: 验证 dsh.bundle/dsh.client、裸包 row、自包含 tgz 与 Client apply 可物化
 * [POS]: bundle 发布不变量测试，拒绝 Typert ambient shim、Harness 源码路径和未打包运行依赖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import * as React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import { describe, expect, it, vi } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('enterprise bundle', () => {
  it('declares the official bundle and Client module manifests without runtime dependencies', async () => {
    const manifest = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8')) as Record<string, any>
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.client).toMatchObject({ platform: 'web' })
    expect(manifest.dsh.client.inject).toEqual([
      '@deepseek-ai/dsh-client-runtime',
      '@deepseek-ai/dsh-client-ui-sidebar',
      '@deepseek-ai/dsh-client-ui-settings-general',
    ])
    expect(manifest.dependencies).toBeUndefined()
    const patch = await readFile(resolve(ROOT, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain("name: '@enterprise-agent/dsh-bundle'")
    expect(patch).not.toContain('deepseek-harness')
  })

  it('materializes the built lazy-CJS Client factory and registers the footer slot', async () => {
    const source = await readFile(resolve(ROOT, 'lib/client.js'), 'utf8')
    expect(source).toContain("id: '@enterprise-agent/dsh-bundle'")
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
    const client = factory?.((id) => {
      if (id === 'react') return React
      if (id === 'react/jsx-runtime') return ReactJsxRuntime
      throw new Error(`unexpected Client external: ${id}`)
    }) as { apply?: (ctx: unknown) => void } | undefined
    expect(client?.apply).toBeTypeOf('function')
    const register = vi.fn(() => () => undefined)
    client?.apply?.({ slots: { inject: (_name: string, callback: () => unknown) => callback(), register } })
    expect(register).toHaveBeenCalledTimes(3)
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
  })
})
