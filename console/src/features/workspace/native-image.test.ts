/**
 * [INPUT]: 依赖原生媒体适配器、真实 Response/AbortSignal 和可记录的加密 link 边界。
 * [OUTPUT]: 验证本地媒体只经远端读取、Blob 释放和失败不回落 Console。
 * [POS]: workspace 的 DOM 媒体边界回归，与 RPC transport 测试互补。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { afterEach, expect, it, vi } from 'vitest';
import type { DshFetchInit, RemoteDshLink } from '@owndsh/remote-core';
import { loadNativeImage } from './native-image';

afterEach(() => vi.restoreAllMocks());

function fixture(response: Response) {
  const fetch = vi.fn(async (_path: string, _init: DshFetchInit) => response);
  const link: RemoteDshLink = { id: 'image', linkId: 'image', deviceId: '1', signal: new AbortController().signal,
    fetch, openMux: () => Promise.reject(new Error('unused')), close() {} };
  return { link, fetch };
}

it('loads native file images through the encrypted carrier and releases the Blob', async () => {
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:remote-image');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const { link, fetch } = fixture(new Response('image bytes', { headers: { 'content-type': 'image/png' } }));
  const image = await loadNativeImage(link, new URL('/api/file?path=%2Fworkspace%2Fimage.png', location.origin).href, new AbortController().signal);
  expect(fetch.mock.calls[0]?.[0]).toBe('/api/file?path=%2Fworkspace%2Fimage.png');
  expect(create).toHaveBeenCalledTimes(1);
  expect(image.url).toBe('blob:remote-image');
  image.dispose();
  expect(revoke).toHaveBeenCalledWith('blob:remote-image');
});

it('rejects failed media without local fallback and skips cancelled requests', async () => {
  const { link, fetch } = fixture(new Response('forbidden', { status: 403 }));
  const input = new URL('/api/file?path=%2Fsecret.png', location.origin).href;
  await expect(loadNativeImage(link, input, new AbortController().signal)).rejects.toThrow('ENT_REMOTE_MEDIA_UNAVAILABLE');
  const abort = new AbortController(); abort.abort();
  await expect(loadNativeImage(link, input, abort.signal)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect((await loadNativeImage(link, 'https://example.org/image.png', new AbortController().signal)).url).toBe('https://example.org/image.png');
  expect(fetch).toHaveBeenCalledTimes(1);
});
