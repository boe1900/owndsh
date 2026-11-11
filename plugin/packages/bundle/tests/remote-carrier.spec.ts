/**
 * [INPUT]: 依赖真实 HTTP server、双端 CarrierTunnel、实际文件系统与原生路径规则。
 * [OUTPUT]: 验证跨帧二进制原样传输、取消与在途帧交错、有界流和文件路径准入。
 * [POS]: bundle/remote 的 carrier 行为验收；不以 JSON 自洽替代字节流证据。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { deferred, CarrierPipe, CARRIER_WINDOW_BYTES, encodeBytes, encodeCarrierFrame, decodeCarrierFrame, type CarrierFrame } from '@owndsh/remote-core'
import { CarrierTunnel } from '../src/remote/carrier-tunnel.js'
import { authorizeFilePayload, authorizeMedia, dshPath, DSH_UNARY_ENDPOINTS } from '../src/remote/dsh-policy.js'
import type { DshCarrier } from '../src/remote/dsh-carrier.js'

function pair(carrier: DshCarrier) {
  const abort = new AbortController()
  const client = new CarrierTunnel(async frame => { host.receive(decodeCarrierFrame(encodeCarrierFrame(frame))) }, abort.signal)
  const host = new CarrierTunnel(async frame => { client.receive(decodeCarrierFrame(encodeCarrierFrame(frame))) }, abort.signal, carrier)
  return { client, host, abort }
}

describe('remote carrier', () => {
  it('streams binary HTTP bodies and responses larger than one relay frame through real HTTP', async () => {
    const server = createServer((request, response) => { response.writeHead(201, { 'content-type': 'application/octet-stream' }); request.pipe(response) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('listener unavailable')
    const { client, abort } = pair({
      fetch: (path, init) => fetch(`http://127.0.0.1:${address.port}${path}`, { ...init, duplex: 'half' }),
      openMux: async () => { throw new Error('unused') }, close() {},
    })
    try {
      const bytes = Uint8Array.from({ length: 300_001 }, (_, index) => index % 251)
      const response = await client.fetch('/api/session/prompt', { method: 'POST', headers: { 'content-type': 'application/octet-stream' },
        body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close() } }) })
      expect(response.status).toBe(201)
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    } finally { abort.abort(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  })

  it('reassembles native mux text across encrypted-frame boundaries without changing Unicode', async () => {
    const incoming = deferred<string>()
    const ended = deferred<void>()
    const { client, abort } = pair({
      async fetch() { throw new Error('unused') },
      async openMux() { return { send: async text => incoming.resolve(text),
        messages: (async function* () { yield await incoming.promise; await ended.promise })(),
        close() { ended.resolve() },
      } },
      close() { ended.resolve() },
    })
    try {
      const mux = await client.openMux()
      const text = JSON.stringify({ type: 'item', streamId: 'terminal', value: '远端终端'.repeat(25_000) })
      await mux.send(text)
      expect((await mux.messages[Symbol.asyncIterator]().next()).value).toBe(text)
      await mux.close()
    } finally { abort.abort() }
  })

  it('uses byte credit and rejects an uncredited producer', async () => {
    const sent: number[] = []
    const pipe = new CarrierPipe('id', async frame => { if (frame.kind === 'data') sent.push(frame.bytes.length) })
    let completed = false
    const sending = pipe.write(new Uint8Array(CARRIER_WINDOW_BYTES + 1)).then(() => { completed = true })
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(sent).toHaveLength(4)
    expect(completed).toBe(false)
    pipe.replenish(1)
    await sending
    expect(completed).toBe(true)
    const receiving = new CarrierPipe('id', async () => {})
    for (let i = 0; i < 4; i++) receiving.receive({ kind: 'data', id: 'id', bytes: encodeBytes(new Uint8Array(24_576)), last: true })
    expect(() => receiving.receive({ kind: 'data', id: 'id', bytes: encodeBytes(new Uint8Array(1)), last: true })).toThrow('CREDIT')
    receiving.abort(); pipe.abort()
  })

  it('aborts native in-flight calls and never substitutes a local result', async () => {
    let observed: AbortSignal | undefined
    const { client, abort } = pair({
      fetch: async (_path, init) => {
        observed = init.signal
        return new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
      }, openMux: async () => { throw new Error('unused') }, close() {},
    })
    const pending = client.fetch('/api/session/prompt', { method: 'POST', headers: {} })
    await new Promise(resolve => setTimeout(resolve, 1))
    abort.abort()
    await expect(pending).rejects.toThrow('CLOSED')
    expect(observed?.aborted).toBe(true)
  })

  it.each(['response', 'error'] as const)('keeps other calls usable when cancel crosses a native %s', async outcome => {
    const lifetime = new AbortController()
    const request = new AbortController()
    const inFlight: CarrierFrame[] = []
    let hold = true
    let calls = 0
    const client = new CarrierTunnel(async frame => host.receive(decodeCarrierFrame(encodeCarrierFrame(frame))), lifetime.signal)
    const host = new CarrierTunnel(async frame => {
      const transmitted = decodeCarrierFrame(encodeCarrierFrame(frame))
      if (hold) inFlight.push(transmitted)
      else client.receive(transmitted)
    }, lifetime.signal, {
      async fetch() {
        calls++
        if (calls === 1 && outcome === 'error') throw new Error('native call failed')
        return new Response(calls === 1 ? 'already transmitted' : 'still connected')
      },
      async openMux() { throw new Error('unused') }, close() {},
    })
    try {
      const pending = client.fetch('/api/session/list', { method: 'POST', headers: {}, signal: request.signal })
      const cancelled = expect(pending).rejects.toThrow('CLOSED')
      await vi.waitFor(() => expect(inFlight.some(frame => frame.kind === (outcome === 'response' ? 'data' : 'error'))).toBe(true))
      request.abort()
      await cancelled
      hold = false
      for (const frame of inFlight) client.receive(frame)
      const response = await client.fetch('/api/session/list', { method: 'POST', headers: {} })
      expect(await response.text()).toBe('still connected')
      expect(lifetime.signal.aborted).toBe(false)
    } finally { lifetime.abort() }
  })

  it('constrains file/media reads to real catalog paths and denies privileged endpoints', async () => {
    const root = await mkdtemp(join(tmpdir(), 'owndsh-remote-policy-'))
    try {
      const workspace = join(root, 'workspace')
      await mkdir(workspace)
      await writeFile(join(workspace, 'inside'), 'remote')
      await writeFile(join(root, 'outside'), 'private')
      await symlink(join(root, 'outside'), join(workspace, 'escape'))
      const catalog = { list: () => [{ id: 'w', path: workspace, sessionIds: ['s'] }] }
      await authorizeFilePayload(catalog, { args: { workspaceFileScopeId: 's', path: 'inside' } })
      await expect(authorizeFilePayload(catalog, { args: { workspaceFileScopeId: 's', path: '../outside' } })).rejects.toThrow()
      await expect(authorizeFilePayload(catalog, { args: { workspaceFileScopeId: 's', path: 'escape' } })).rejects.toThrow()
      await expect(authorizeFilePayload(catalog, { args: { workspaceFileScopeId: 'other', path: 'inside' } })).rejects.toThrow()
      await expect(authorizeMedia(catalog, join(root, 'outside'))).rejects.toThrow()
      expect(dshPath('/api/file?path=%2Fwork%2Fimage.png').searchParams.get('path')).toBe('/work/image.png')
      expect(() => dshPath('/api/../enterprise/api')).toThrow()
      expect(() => dshPath('https://other/api/session/list')).toThrow()
      expect(DSH_UNARY_ENDPOINTS.has('settings/update')).toBe(false)
      expect(DSH_UNARY_ENDPOINTS.has('pluginManager/install')).toBe(false)
      expect(DSH_UNARY_ENDPOINTS.has('session/openWorkspacePath')).toBe(false)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
