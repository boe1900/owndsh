/**
 * [INPUT]: 依赖当前 document 的加密 link、原生媒体 URL 与图片组件取消信号。
 * [OUTPUT]: 将远端文件与插件文档图片转换为有明确释放所有权的 Blob URL，外部图片保留原 URL。
 * [POS]: 原生 Markdown 与悬停图片的异步媒体接缝，防止 DOM 绕过 transport 请求 Console 本机。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { type RemoteDshLink } from '@owndsh/remote-core';

const NATIVE_IMAGE_PATHS = new Set(['/api/file', '/api/plugin-manager/detail-file', '/api/plugin-market/detail-file']);

export async function loadNativeImage(link: RemoteDshLink, input: string, signal: AbortSignal): Promise<{ url: string; dispose(): void }> {
  const target = new URL(input, location.origin);
  if (target.origin !== location.origin || !NATIVE_IMAGE_PATHS.has(target.pathname)) return { url: input, dispose() {} };
  const active = AbortSignal.any([link.signal, signal]);
  active.throwIfAborted();
  const response = await link.fetch(target.pathname + target.search, { method: 'GET', headers: {}, signal: active });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
    await response.body?.cancel();
    throw new Error('ENT_REMOTE_MEDIA_UNAVAILABLE');
  }
  const blob = await response.blob();
  active.throwIfAborted();
  const url = URL.createObjectURL(blob);
  return { url, dispose: () => URL.revokeObjectURL(url) };
}
