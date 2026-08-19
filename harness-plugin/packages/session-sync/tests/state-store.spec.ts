/**
 * [INPUT]: 依赖真实临时目录、SessionCursorStore 严格 schema 与原子 rename 写入
 * [OUTPUT]: 验证 0600、稳定排序、无正文字段、损坏拒绝和临时文件清理
 * [POS]: session-sync 磁盘边界验收，防止确认游标半写或 Session 正文落盘
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { INITIAL_ROLLING_HASH, SessionCursorStore } from '../src/index.js'

const homes: string[] = []

afterEach(async () => {
  await Promise.all(homes.splice(0).map(home => rm(home, { force: true, recursive: true })))
})

describe('SessionCursorStore', () => {
  it('atomically writes only sorted cursor metadata with owner-only permissions', async () => {
    const home = await mkdtemp(join(tmpdir(), 'enterprise-session-cursor-'))
    homes.push(home)
    const store = new SessionCursorStore(home)
    const hash = INITIAL_ROLLING_HASH.toString('base64')
    await store.write({
      formatVersion: 1,
      sessions: [
        {
          sessionId: 'z-last', sourceDeviceId: '90018', lastAckSeq: 2, rollingHash: hash,
          state: 'SYNCED', lastErrorCode: null, updatedAt: '2026-08-19T00:00:00.000Z',
          lastSuccessAt: '2026-08-19T00:00:00.000Z',
        },
        {
          sessionId: 'a-first', sourceDeviceId: '90018', lastAckSeq: -1, rollingHash: hash,
          state: 'PENDING', lastErrorCode: null, updatedAt: '2026-08-19T00:00:00.000Z',
          lastSuccessAt: null,
        },
      ],
    })
    expect((await store.read()).sessions.map(cursor => cursor.sessionId)).toEqual(['a-first', 'z-last'])
    expect((await stat(store.path)).mode & 0o777).toBe(0o600)
    const text = await readFile(store.path, 'utf8')
    expect(text).not.toMatch(/events|header|title|token|authorization/i)
    expect((await readdir(dirname(store.path))).filter(name => name.endsWith('.tmp'))).toEqual([])
  })

  it('rejects unknown fields instead of accepting hidden Session content', async () => {
    const home = await mkdtemp(join(tmpdir(), 'enterprise-session-cursor-invalid-'))
    homes.push(home)
    const store = new SessionCursorStore(home)
    await store.write({ formatVersion: 1, sessions: [] })
    await writeFile(store.path, JSON.stringify({ formatVersion: 1, sessions: [], events: [] }))
    await expect(store.read()).rejects.toMatchObject({ code: 'ENT_SESSION_STATE_INVALID' })
  })
})
