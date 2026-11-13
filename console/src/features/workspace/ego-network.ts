/**
 * [INPUT]: 依赖当前 document 的 RemoteDshLink、固定 Ego 契约和标准 SSE parser。
 * [OUTPUT]: 按远端能力安装局部 fetch/EventSource，画面失效时停止输入并明确提示，保留普通工作区。
 * [POS]: 固定 Ego factory 的唯一网络边界；不替换全局网络，不执行远端插件代码。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { EventSource } from 'eventsource';
import { EGO_PREFIX, egoRoute, egoInputSchema, parseEgoBody, remoteClientCatalogSchema, type EgoCapability } from '@owndsh/contracts';
import type { RemoteDshLink } from '@owndsh/remote-core';
import { EgoInputQueue } from './ego-input';

export async function egoCapability(link: RemoteDshLink): Promise<EgoCapability> {
  try {
    const response = await link.fetch('/api/remoteClient/catalog', { method: 'GET', headers: {}, signal: AbortSignal.any([link.signal, AbortSignal.timeout(10_000)]) });
    if (!response.ok) { await response.body?.cancel(); return { state: 'unavailable', reason: 'host-unsupported' }; }
    const parsed = remoteClientCatalogSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.ego : { state: 'unavailable', reason: 'host-unsupported' };
  } catch {
    link.signal.throwIfAborted();
    return { state: 'unavailable', reason: 'host-unsupported' };
  }
}

export function installEgoNetwork(link: RemoteDshLink, capability: EgoCapability, report = showEgoFailure) {
  const sources = new Set<EventSource>();
  const watchers = new Set<string>();
  let captureBlocked = false;
  const dispatch = (id: string, method: string, body?: string, signal = link.signal) => {
    link.signal.throwIfAborted();
    return link.fetch(EGO_PREFIX + id, { method, headers: body ? { 'content-type': 'application/json' } : {},
      ...(body ? { body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close(); } }) } : {}),
      signal: AbortSignal.any([link.signal, signal, ...(id === 'stream' ? [] : [AbortSignal.timeout(12_000)])]),
    });
  };
  const queue = new EgoInputQueue(link.signal, input => dispatch('input', 'POST', JSON.stringify(input)), () => {
    if (!captureBlocked) report('浏览器输入已停止，请重新连接远程工作区后再操作。会话和文件仍可使用。');
  });
  const blockCapture = (message: string) => {
    if (captureBlocked) return;
    captureBlocked = true;
    queue.stop(new Error('ENT_REMOTE_EGO_UNAVAILABLE'));
    report(message);
    for (const source of sources) source.close();
    for (const clientId of watchers) void dispatch('stop', 'POST', JSON.stringify({ clientId })).then(response => response.body?.cancel()).catch(() => {});
    watchers.clear();
  };
  const checkCapture = (value: unknown): boolean => {
    if (typeof value !== 'object' || value === null) return false;
    const unsupported = 'backend' in value && value.backend === 'ffmpeg';
    const disabled = 'frameRelay' in value && value.frameRelay === false;
    if (!unsupported && !disabled) return false;
    blockCapture(unsupported ? '远端浏览器使用 FFmpeg 捕获，当前远程工作区仅支持 CDP。请在远端切换为 CDP 后重新连接。'
      : '远端已关闭浏览器画面回传，请在远端开启后重新连接。');
    return true;
  };
  const remoteFetch: typeof fetch = async (input, init) => {
    link.signal.throwIfAborted();
    const request = new Request(input instanceof Request ? input : new URL(String(input), location.origin), init);
    const url = new URL(request.url);
    if (capability.state !== 'available' || url.origin !== location.origin || url.hash) throw new Error('ENT_REMOTE_DENIED');
    const route = egoRoute(url.pathname + url.search, request.method, false);
    if (captureBlocked && route.id !== 'stop') throw new Error('ENT_REMOTE_EGO_UNAVAILABLE');
    let body: string | undefined;
    if (request.body) {
      const bytes = new Uint8Array(await request.arrayBuffer());
      let value: unknown;
      try { value = parseEgoBody(route, bytes); }
      catch (error) { report('浏览器操作内容不受支持。单次文字输入最多 10000 个字符。'); throw error; }
      if (route.id === 'input') return queue.enqueue(egoInputSchema.parse(value));
      if (typeof value === 'object' && value !== null && 'clientId' in value && typeof value.clientId === 'string') {
        if (route.id === 'stop') watchers.delete(value.clientId);
        else watchers.add(value.clientId);
      }
      body = JSON.stringify(value);
    }
    try {
      const response = await dispatch(route.id, request.method, body, request.signal);
      if (['status', 'spaces', 'start', 'switch'].includes(route.id) && response.ok) {
        const data: unknown = await response.clone().json();
        if (checkCapture(data)) return Response.json({ ok: false, state: 'disabled', frameRelay: false, backend: 'cdp', spaces: [] });
      }
      if (!response.ok && route.method === 'POST') report('浏览器操作失败，请检查远端浏览器状态后重试。');
      if (response.ok && route.method === 'POST') {
        const data: unknown = await response.clone().json();
        if (typeof data === 'object' && data !== null && 'ok' in data && data.ok === false) report('浏览器操作失败，请检查远端浏览器状态后重试。');
      }
      return response;
    } catch (error) {
      if (!link.signal.aborted && !request.signal.aborted && route.method === 'POST') report('浏览器操作未完成，请检查远端浏览器状态。');
      throw error;
    }
  };
  class RemoteEventSource extends EventSource {
    constructor(url: string | URL) {
      super(url, { fetch: remoteFetch, maxBufferSize: 4 * 1024 * 1024 });
      sources.add(this);
      this.addEventListener('error', event => {
        event.stopImmediatePropagation();
        if (link.signal.aborted || captureBlocked) { this.close(); return; }
        blockCapture('远端浏览器画面已中断，浏览器操作已停止。请刷新远程工作区后重试，会话和文件仍可使用。');
        void egoCapability(link).then(current => {
          if (link.signal.aborted || current.state !== 'unavailable') return;
          const reason = current.reason === 'disabled' ? '远端浏览器插件已停用' : '远端浏览器能力已不可用';
          report(`${reason}，浏览器操作已停止。请在远端恢复后刷新工作区，会话和文件仍可使用。`);
        }).catch(() => {});
      });
      this.addEventListener('capture-status', event => {
        if (!(event instanceof MessageEvent) || typeof event.data !== 'string') return;
        try { if (checkCapture(JSON.parse(event.data))) event.stopImmediatePropagation(); } catch {}
      });
      if (link.signal.aborted) this.close();
    }
    override close(): void { super.close(); sources.delete(this); }
  }
  link.signal.addEventListener('abort', () => { for (const source of sources) source.close(); }, { once: true });
  const network = Object.freeze({ available: capability.state === 'available', fetch: remoteFetch, EventSource: RemoteEventSource });
  Object.defineProperty(window, '__OWNDSH_EGO_TRANSPORT__', { configurable: true, value: network });
  return network;
}

function showEgoFailure(message: string): void {
  let alert = document.getElementById('owndsh-ego-alert');
  if (!alert) { alert = document.createElement('div'); alert.id = 'owndsh-ego-alert'; alert.setAttribute('role', 'alert'); document.body.append(alert); }
  alert.textContent = message;
}
