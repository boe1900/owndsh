/**
 * [INPUT]: 依赖 Vitest 与共享 UUID 生成器，用固定随机字节验证输出格式。
 * [OUTPUT]: 验证仅有 getRandomValues 的 HTTP 环境仍生成保留随机位的标准 UUID v4。
 * [POS]: lib 的幂等键兼容性门禁，覆盖版本/变体位与固定长度编码。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUuid } from './crypto';

afterEach(() => vi.unstubAllGlobals());

describe('HTTP UUID generation', () => {
  it.each([
    [0, '00000000-0000-4000-8000-000000000000'],
    [255, 'ffffffff-ffff-4fff-bfff-ffffffffffff']
  ] as const)('uses secure random bytes and sets UUID v4 bits for %i', (byte, expected) => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(byte));
    vi.stubGlobal('crypto', { getRandomValues });
    expect(randomUuid()).toBe(expected);
    expect(getRandomValues).toHaveBeenCalledOnce();
    expect(getRandomValues.mock.calls[0][0].length).toBe(16);
  });
});
