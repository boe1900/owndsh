/**
 * [INPUT]: 依赖 contracts/remote 正反 fixture 与 Remote v1 Zod facade。
 * [OUTPUT]: 验证 control/relay 边界，并锁定已发布 Java/TypeScript Remote v1 握手兼容性。
 * [POS]: contracts 的 Remote 跨语言边界回归；不测试业务 RPC 实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { remoteProtocolSha256, zRemoteControlFrame, zRemoteRelayFrame } from '../src/remote.js'

const fixture = async (name: string) => JSON.parse(await readFile(resolve(process.cwd(), '../../../contracts/remote/fixtures', name), 'utf8')) as unknown

describe('Remote v1 fixtures', () => {
  it('preserves the released v1 identity across HTTP API additions', async () => {
    expect(remoteProtocolSha256).toBe('629fbf0d745ada4c98d34393335e2da26a788be5638810a21041f0431b3a9cf3')
    const java = await readFile(resolve(process.cwd(), '../../../server/owndsh-modules/owndsh-enterprise/src/main/java/com/owndsh/enterprise/remote/RemoteProtocol.java'), 'utf8')
    expect(java).toContain(`PROTOCOL_SHA256 = "${remoteProtocolSha256}"`)
  })
  it('accepts control and relay positive fixtures', async () => {
    expect(zRemoteControlFrame.safeParse(await fixture('hello.valid.json')).success).toBe(true)
    expect(zRemoteRelayFrame.safeParse(await fixture('relay.valid.json')).success).toBe(true)
  })

  it('rejects invalid fixture at the TypeScript boundary', async () => {
    expect(zRemoteControlFrame.safeParse(await fixture('error.invalid.json')).success).toBe(false)
  })
})
