/**
 * [INPUT]: 依赖真实共享 Noise/lease/carrier 和进程内 Cookie WebSocket/ticket 服务器夹具。
 * [OUTPUT]: 验证浏览器建链完成才放行业务、密文传输和 busy 错误保留及显式释放。
 * [POS]: workspace 的跨端连接回归，夹具只路由控制面，不替代密码实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { remoteProtocolSha256, parseRemoteControlFrame, parseRemoteRelayFrame, type RemoteControlFrame, type RemoteRelayFrame } from '@owndsh/contracts';
import { SecureDshLink, encodeKey, generateNoiseKeyPair, remoteFrameId, type DshCarrier } from '@owndsh/remote-core';
import { client } from '@/api/generated/client.gen';
import { connectBrowserWorkspace, type WorkspaceLinkState } from './browser-link';

const cleanups: Array<() => void> = [];
afterEach(() => { for (const close of cleanups.splice(0)) close(); vi.unstubAllGlobals(); client.setConfig({ baseUrl: '' }); });

function server(busy: false | 'reject' | 'error' = false) {
  const key = generateNoiseKeyPair();
  const linkId = remoteFrameId('rln');
  let host: SecureDshLink | undefined;
  let socket: Socket | undefined;
  let controllerPublicKey = '';
  const ciphertexts: string[] = [];
  const carrier: DshCarrier = { fetch: async path => new Response(`host:${path}`), openMux: () => Promise.reject(new Error('unused')), close() {} };
  class Socket extends EventTarget {
    static readonly OPEN = 1;
    readyState = 0;
    bufferedAmount = 0;
    constructor() { super(); socket = this; queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
    send(text: string): void {
      const value: unknown = JSON.parse(text);
      if (typeof value === 'object' && value !== null && 'kind' in value) {
        const frame = parseRemoteRelayFrame(value);
        if (frame.payload) ciphertexts.push(frame.payload);
        queueMicrotask(() => host?.relay(frame));
        return;
      }
      const frame = parseRemoteControlFrame(value);
      if (frame.type === 'hello') {
        this.deliver({ v: 1, type: 'hello.ack', id: remoteFrameId(), ts: Date.now(), payload: { peerRole: 'controller', protocolSha256: remoteProtocolSha256, serverTime: Date.now() } });
      } else if (frame.type === 'connect.request') {
        if (busy === 'reject') { this.deliver({ v: 1, type: 'connect.reject', id: remoteFrameId(), ts: Date.now(), payload: { linkId, code: 'ENT_REMOTE_BUSY' } }); return; }
        if (busy === 'error') { this.deliver({ v: 1, type: 'error', id: remoteFrameId(), ts: Date.now(), payload: { code: 'ENT_REMOTE_BUSY', message: 'peer already has a link', retryable: true } }); return; }
        host = new SecureDshLink({ role: 'host', linkId, hostDeviceId: '1', controllerId: frame.payload.controllerId,
          hostPublicKey: encodeKey(key.publicKey), controllerPublicKey, localKey: key,
          connection: { currentState: () => 'READY', send: data => this.deliver(data), sendRelay: data => this.deliver(data) },
          serverNow: Date.now, openCarrier: async () => carrier, closed() {},
        });
        this.deliver({ v: 1, type: 'connect.accept', id: remoteFrameId(), ts: Date.now(), payload: { linkId, expiresAt: Date.now() + 60_000 } });
      } else if (frame.type === 'connection.lease.acquire' || frame.type === 'connection.lease.renew') {
        const ack = { ...frame, payload: { ...frame.payload, expiresAt: Date.now() + 60_000 } };
        this.deliver(ack); queueMicrotask(() => host?.control(ack));
      } else queueMicrotask(() => host?.control(frame));
    }
    close(): void { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new CloseEvent('close', { code: 1000 })); }
    deliver(frame: RemoteControlFrame | RemoteRelayFrame): void {
      queueMicrotask(() => { if (this.readyState === 1) this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) })); });
    }
  }
  vi.stubGlobal('WebSocket', Socket);
  client.setConfig({ baseUrl: location.origin });
  vi.stubGlobal('fetch', async (input: Request) => {
    const request: unknown = JSON.parse(await input.text());
    if (typeof request !== 'object' || request === null || !('controllerPublicKey' in request) || typeof request.controllerPublicKey !== 'string') throw new Error('invalid test request');
    controllerPublicKey = request.controllerPublicKey;
    return Response.json({ requestId: remoteFrameId('req'), data: { ticket: 't'.repeat(32), linkId, deviceId: '1', expiresAt: new Date(Date.now() + 60_000).toISOString(), iceServers: [], hostPublicKey: encodeKey(key.publicKey) } });
  });
  cleanups.push(() => host?.close(false));
  return { ciphertexts, close: (code: string, target = linkId) => socket?.deliver({ v: 1, kind: 'close', linkId: target, seq: 0, code }) };
}

describe('browser secure workspace link', () => {
  it('performs real Noise and lease before allowing a remote request, then releases on page exit', async () => {
    const { ciphertexts } = server();
    const lifetime = new AbortController();
    const states: WorkspaceLinkState[] = [];
    const link = await connectBrowserWorkspace('1', lifetime.signal, state => states.push(state));
    expect(states.at(-1)).toEqual({ kind: 'ready' });
    expect(await (await link.fetch('/api/session/list', { method: 'POST', headers: {} })).text()).toBe('host:/api/session/list');
    expect(ciphertexts.length).toBeGreaterThan(0);
    expect(ciphertexts.every(value => !value.includes('/api/session/list'))).toBe(true);
    lifetime.abort();
    expect(link.signal.aborted).toBe(true);
    expect(() => link.fetch('/api/session/prompt', { method: 'POST', headers: {} })).toThrow();
  });

  it('preserves takeover close reason only for this exact link and fences subsequent requests', async () => {
    const fixture = server();
    const states: WorkspaceLinkState[] = [];
    const link = await connectBrowserWorkspace('1', new AbortController().signal, state => states.push(state));
    fixture.close('ENT_REMOTE_TAKEN_OVER', remoteFrameId('rln'));
    await Promise.resolve();
    expect(link.signal.aborted).toBe(false);
    fixture.close('ENT_REMOTE_TAKEN_OVER');
    await Promise.resolve();
    expect(link.signal.aborted).toBe(true);
    expect(states.at(-1)).toEqual({ kind: 'closed', code: 'ENT_REMOTE_TAKEN_OVER' });
    expect(() => link.fetch('/api/session/prompt', { method: 'POST', headers: {} })).toThrow();
  });

  it.each(['reject', 'error'] as const)('preserves the occupied-device %s instead of replacing it with a network error', async busy => {
    server(busy);
    const states: WorkspaceLinkState[] = [];
    await expect(connectBrowserWorkspace('1', new AbortController().signal, state => states.push(state))).rejects.toThrow('ENT_REMOTE_BUSY');
    expect(states.at(-1)).toEqual({ kind: 'closed', code: 'ENT_REMOTE_BUSY' });
  });
});
