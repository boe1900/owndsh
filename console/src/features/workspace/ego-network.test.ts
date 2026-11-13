/**
 * [INPUT]: 依赖原生 Request/Response、局部 Ego 适配器及记录加密请求的 link。
 * [OUTPUT]: 验证旧 Host 降级、断线传播、局部网络隔离、捕获失效停止积压输入与停用提示。
 * [POS]: Console 可选浏览器能力的装配边界回归。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { describe, expect, it, vi } from 'vitest';
import type { DshFetchInit, RemoteDshLink } from '@owndsh/remote-core';
import { egoCapability, installEgoNetwork } from './ego-network';
function fixture() {
  const abort = new AbortController();
  const fetch = vi.fn(async (_path: string, _init: DshFetchInit) => Response.json({ ok: true }));
  const link: RemoteDshLink = { id: 'ego', linkId: 'ego', deviceId: '1', signal: abort.signal, fetch,
    openMux: () => Promise.reject(new Error('unused')), close() { abort.abort(); } };
  return { link, fetch, abort };
}
const available = { state: 'available', version: '0.9.14', capture: 'cdp' } as const;
describe('optional Ego network', () => {
  it('treats a denied catalog from an old Host as unsupported while preserving a live link', async () => {
    const { link, fetch } = fixture();
    fetch.mockRejectedValueOnce(new Error('ENT_REMOTE_DENIED'));
    expect(await egoCapability(link)).toEqual({ state: 'unavailable', reason: 'host-unsupported' });
    expect(link.signal.aborted).toBe(false);
    const originalFetch = window.fetch, originalEventSource = window.EventSource;
    const network = installEgoNetwork(link, { state: 'unavailable', reason: 'host-unsupported' });
    expect(network.available).toBe(false);
    expect(window.fetch).toBe(originalFetch);
    expect(window.EventSource).toBe(originalEventSource);
    await expect(network.fetch('/api/ego/spaces')).rejects.toThrow('ENT_REMOTE_DENIED');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('propagates link cancellation instead of downgrading a disconnected workspace', async () => {
    const { link, fetch, abort } = fixture();
    fetch.mockImplementationOnce(async () => { abort.abort(); throw new Error('closed'); });
    await expect(egoCapability(link)).rejects.toThrow();
  });
  it('maps only exact routes to the encrypted carrier and rejects native login bridge requests', async () => {
    const { link, fetch } = fixture();
    const network = installEgoNetwork(link, available);
    await network.fetch('/api/ego/spaces');
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/remoteClient/ego/spaces');
    for (const path of ['/api/ego/login-extension/health', '/api/ego/raise', '/api/ego/spaces?target=http://localhost', 'http://other.test/api/ego/spaces']) {
      await expect(network.fetch(path)).rejects.toThrow('ENT_REMOTE_DENIED');
    }
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([{ backend: 'ffmpeg' }, { frameRelay: false }])('shows a reason and stops new capture requests for %j', async data => {
    const { link, fetch } = fixture();
    fetch.mockResolvedValueOnce(Response.json({ ok: true, ...data }));
    const report = vi.fn();
    const network = installEgoNetwork(link, available, report);
    const result = await network.fetch('/api/ego/watch/status');
    expect(await result.json()).toMatchObject({ frameRelay: false, state: 'disabled' });
    expect(report).toHaveBeenCalledOnce();
    await expect(network.fetch('/api/ego/stream')).rejects.toThrow('ENT_REMOTE_EGO_UNAVAILABLE');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('reports mutation errors that the native UI otherwise swallows', async () => {
    const { link, fetch } = fixture();
    fetch.mockResolvedValueOnce(Response.json({ ok: false }, { status: 502 }));
    const report = vi.fn();
    const network = installEgoNetwork(link, available, report);
    const result = await network.fetch('/api/ego/close', { method: 'POST', body: JSON.stringify({ targetId: 't' }) });
    expect(result.status).toBe(502);
    expect(report).toHaveBeenCalledOnce();
  });
  it('stops queued input when capture becomes unavailable and releases only the pressed key', async () => {
    const { link, fetch } = fixture();
    let finish: (response: Response) => void = () => {};
    const gate = new Promise<Response>(resolve => { finish = resolve; });
    fetch.mockImplementation(async (path) => path.endsWith('/status') ? Response.json({ backend: 'ffmpeg' }) : Response.json({ ok: true }));
    fetch.mockImplementationOnce(() => gate);
    const network = installEgoNetwork(link, available, vi.fn());
    const first = network.fetch('/api/ego/input', { method: 'POST', body: JSON.stringify({ targetId: 't', type: 'keyDown', key: 'Shift' }) });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const second = network.fetch('/api/ego/input', { method: 'POST', body: JSON.stringify({ targetId: 't', type: 'insertText', text: 'must not arrive' }) });
    const settled = Promise.allSettled([first, second]);
    await network.fetch('/api/ego/watch/status');
    finish(Response.json({ ok: true }));
    expect((await settled).every(result => result.status === 'rejected')).toBe(true);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const cleanup = fetch.mock.calls[2];
    expect(cleanup?.[0]).toBe('/api/remoteClient/ego/input');
    expect(await new Response(cleanup?.[1].body).json()).toMatchObject({ type: 'keyUp', key: 'Shift' });
    expect(link.signal.aborted).toBe(false);
  });
  it('shows disabled capability after stream failure and closes the stream without closing the workspace', async () => {
    const { link, fetch } = fixture();
    fetch.mockImplementation(async path => path.endsWith('/stream')
      ? new Response(new ReadableStream<Uint8Array>(), { headers: { 'content-type': 'text/event-stream' } })
      : Response.json({ ego: { state: 'unavailable', reason: 'disabled' } }));
    const report = vi.fn();
    const network = installEgoNetwork(link, available, report);
    const source = new network.EventSource('/api/ego/stream');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    source.dispatchEvent(new Event('error'));
    await vi.waitFor(() => expect(report).toHaveBeenLastCalledWith(expect.stringContaining('已停用')));
    expect(source.readyState).toBe(2);
    await expect(network.fetch('/api/ego/input', { method: 'POST', body: JSON.stringify({ targetId: 't', type: 'insertText', text: 'blocked' }) })).rejects.toThrow('ENT_REMOTE_EGO_UNAVAILABLE');
    expect(link.signal.aborted).toBe(false);
    source.close();
  });
});
