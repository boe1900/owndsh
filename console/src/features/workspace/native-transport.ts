/**
 * [INPUT]: 依赖单个已就绪加密 link、固定 assembly metadata 与官方文本 mux 契约。
 * [OUTPUT]: 提供原生 __DSH_TRANSPORT__ fetch/createWebSocket/loadBundle 接口。
 * [POS]: workspace 的官方 carrier 适配器；未知路径只到远端，绝不回退本机。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { dshPath, safeHeaders, type RemoteDshLink, type RemoteDshMux } from '@owndsh/remote-core';
import { z } from 'zod';
import { createBundleLoader, type NativeAssembly } from './native-assembly';

const requestEnvelope = z.object({ type: z.literal('client-request'), rpcId: z.string(), method: z.string() });
const metadataResponse = z.object({ type: z.literal('server-response'), rpcId: z.string(), result: z.unknown() });

export function createNativeTransport(link: RemoteDshLink, assembly: NativeAssembly) {
  return {
    streamBaseUrl: `${location.origin}/`,
    loadBundle: createBundleLoader(assembly),
    async fetch(input: string | URL, init: RequestInit): Promise<Response> {
      link.signal.throwIfAborted();
      const path = nativeApiPath(input.toString());
      if (Object.hasOwn(assembly.metadata, path)) {
        const request = requestEnvelope.parse(JSON.parse(typeof init.body === 'string' ? init.body : 'null'));
        const response = metadataResponse.parse(assembly.metadata[path]);
        return Response.json({ ...response, rpcId: request.rpcId });
      }
      const request = new Request(new URL(path, location.origin), init);
      return link.fetch(path, { method: request.method, headers: safeHeaders(request.headers),
        ...(request.body ? { body: request.body } : {}), signal: request.signal });
    },
    createWebSocket(input: string): EventTarget & { readonly readyState: number; send(data: string): void; close(): void } {
      const url = new URL(input);
      const expected = new URL(location.origin); expected.protocol = expected.protocol === 'https:' ? 'wss:' : 'ws:';
      if (url.origin !== expected.origin || url.pathname !== '/api/remote.mux' || url.search || url.hash) throw new Error('ENT_REMOTE_DENIED');
      return new TunnelSocket(link);
    },
  };
}

export function nativeApiPath(input: string): string {
  const url = new URL(input.startsWith('api/') ? `/${input}` : input, location.origin);
  if (url.origin !== location.origin || url.hash) throw new Error('ENT_REMOTE_DENIED');
  const path = url.pathname + url.search;
  dshPath(path);
  return path;
}

class TunnelSocket extends EventTarget {
  readyState = 0;
  private mux: RemoteDshMux | undefined;
  private readonly onAbort = () => this.close();
  constructor(private readonly link: RemoteDshLink) {
    super();
    link.signal.addEventListener('abort', this.onAbort, { once: true });
    queueMicrotask(() => { void this.open(); });
  }
  send(data: string): void {
    if (this.readyState !== 1 || !this.mux) throw new Error('ENT_REMOTE_CLOSED');
    void this.mux.send(data).catch(() => this.fail());
  }
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.link.signal.removeEventListener('abort', this.onAbort);
    void this.mux?.close();
    this.dispatchEvent(new Event('close'));
  }
  private async open(): Promise<void> {
    try {
      const mux = await this.link.openMux();
      if (this.readyState === 3) { void mux.close(); return; }
      this.mux = mux;
      this.readyState = 1;
      this.dispatchEvent(new Event('open'));
      for await (const text of mux.messages) {
        if (this.readyState !== 1) return;
        this.dispatchEvent(new MessageEvent('message', { data: text }));
      }
      if (this.readyState === 1) this.fail();
    } catch { if (this.readyState !== 3) this.fail(); }
  }
  private fail(): void {
    this.dispatchEvent(new Event('error'));
    this.close();
    void this.link.close();
  }
}
