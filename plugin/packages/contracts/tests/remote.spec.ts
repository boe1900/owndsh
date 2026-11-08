/**
 * [INPUT]: 依赖 contracts/remote 正反 fixture 与 Remote v1 Zod facade。
 * [OUTPUT]: 验证 TypeScript 对 control/relay 正例放行、额外字段和非法 ID 拒绝。
 * [POS]: contracts 的 Remote 跨语言边界回归；不测试业务 RPC 实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { zRemoteControlFrame, zRemoteRelayFrame } from '../src/remote.js'

const fixture = async (name: string) => JSON.parse(await readFile(resolve(process.cwd(), '../../../contracts/remote/fixtures', name), 'utf8')) as unknown

describe('Remote v1 fixtures', () => {
  it('accepts control and relay positive fixtures', async () => {
    expect(zRemoteControlFrame.safeParse(await fixture('hello.valid.json')).success).toBe(true)
    expect(zRemoteRelayFrame.safeParse(await fixture('relay.valid.json')).success).toBe(true)
  })

  it('rejects invalid fixture at the TypeScript boundary', async () => {
    expect(zRemoteControlFrame.safeParse(await fixture('error.invalid.json')).success).toBe(false)
  })
})
