/**
 * [INPUT]: 依赖 Vitest 与 token-capacity 的公开转换函数。
 * [OUTPUT]: 验证 Harness 十进制 K/M 语义和非法容量拒绝行为。
 * [POS]: features/models 的容量契约门禁，防止回退到 1024 进制。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import { formatTokenCapacity, parseTokenCapacity, TOKEN_CAPACITY_ERROR } from './token-capacity';

describe('token capacity', () => {
  it('uses Harness decimal K/M units', () => {
    expect(parseTokenCapacity('256K')).toBe(256_000);
    expect(parseTokenCapacity('1M')).toBe(1_000_000);
    expect(formatTokenCapacity(128_000)).toBe('128K');
    expect(() => parseTokenCapacity('256KiB')).toThrow(TOKEN_CAPACITY_ERROR);
  });
});
