/**
 * [INPUT]: 依赖 tokenCapacity 的纯解析与格式化函数。
 * [OUTPUT]: 验证 K/M、整数、空值、非法值及 API 整数回显。
 * [POS]: model-catalog 容量表单的最小回归门禁，锁定 UI 文本与整数协议之间的换算。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import { formatTokenCapacity, parseTokenCapacity, TOKEN_CAPACITY_ERROR, validateTokenCapacity } from './tokenCapacity';

describe('token capacity', () => {
  it('parses integer and Harness decimal K/M values', () => {
    expect(parseTokenCapacity('262144')).toBe(262_144);
    expect(parseTokenCapacity('256K')).toBe(256_000);
    expect(parseTokenCapacity('1m')).toBe(1_000_000);
    expect(parseTokenCapacity('2.3M')).toBe(2_300_000);
    expect(parseTokenCapacity('1.5K')).toBe(1_500);
    expect(parseTokenCapacity('')).toBeUndefined();
  });

  it('rejects malformed and out-of-range values', async () => {
    for (const value of ['256KB', '1.0005K', '0', '2148M']) {
      expect(() => parseTokenCapacity(value)).toThrow(TOKEN_CAPACITY_ERROR);
      await expect(validateTokenCapacity(undefined, value)).rejects.toThrow(TOKEN_CAPACITY_ERROR);
    }
  });

  it('formats exact decimal units without changing other integers', () => {
    expect(formatTokenCapacity(256_000)).toBe('256K');
    expect(formatTokenCapacity(1_000_000)).toBe('1M');
    expect(formatTokenCapacity(262_144)).toBe('262144');
    expect(formatTokenCapacity(1536)).toBe('1536');
    expect(formatTokenCapacity(undefined)).toBe('');
  });
});
