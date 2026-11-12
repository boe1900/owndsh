/**
 * [INPUT]: 依赖真实 Request/Response 与原生 carrier 适配器，使用固定 link 记录业务调用。
 * [OUTPUT]: 验证 metadata 关联、业务只送远端一次与跨 origin/非 API 路径拒绝。
 * [POS]: workspace 的传输边界回归，不复制原生 RPC 或加密算法。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { describe, expect, it, vi } from 'vitest';
import type { DshFetchInit, RemoteDshLink } from '@owndsh/remote-core';
import { createNativeTransport, nativeApiPath } from './native-transport';
import type { NativeAssembly } from './native-assembly';

const assembly: NativeAssembly = {
  harnessVersion: '0.2.1-rc.5', html: '', resources: {},
  metadata: { '/api/settings/describe': { type: 'server-response', rpcId: 'captured', result: { ok: true, value: [] } } },
};
function fixture() {
  const fetch = vi.fn(async (_path: string, _init: DshFetchInit) => Response.json({ remote: true }));
  const link: RemoteDshLink = { id: 'test', linkId: 'test', deviceId: '1', signal: new AbortController().signal, fetch,
    openMux: () => Promise.reject(new Error('unused')), close() {} };
  return { link, fetch, transport: createNativeTransport(link, assembly) };
}

describe('native remote carrier boundary', () => {
  it('rebinds fixed assembly metadata to the current RPC request', async () => {
    const { fetch, transport } = fixture();
    const response = await transport.fetch('api/settings/describe', { method: 'POST', body: JSON.stringify({ type: 'client-request', rpcId: 'current', method: 'settings/describe', payload: {} }) });
    expect(await response.json()).toEqual({ type: 'server-response', rpcId: 'current', result: { ok: true, value: [] } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('forwards each mutation once and never falls back to local fetch', async () => {
    const { fetch, transport } = fixture();
    fetch.mockRejectedValueOnce(new Error('ENT_REMOTE_CLOSED'));
    await expect(transport.fetch('api/session/prompt', { method: 'POST', body: 'test' })).rejects.toThrow('ENT_REMOTE_CLOSED');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/session/prompt');
  });

  it('rejects paths and sockets outside the single native API carrier', () => {
    const { transport } = fixture();
    for (const path of ['https://other.invalid/api/session/list', '/enterprise/admin/v1/members', '/api/session%2flist', '/api/session/list#other']) {
      expect(() => nativeApiPath(path)).toThrow('ENT_REMOTE_DENIED');
    }
    expect(() => transport.createWebSocket('ws://other.invalid/api/remote.mux')).toThrow('ENT_REMOTE_DENIED');
    expect(() => transport.createWebSocket(new URL('/api/other', location.origin).href.replace('http:', 'ws:'))).toThrow('ENT_REMOTE_DENIED');
  });
});
