/**
 * [INPUT]: 依赖 mutation header 构造器与 Web Crypto UUID
 * [OUTPUT]: 验证创建幂等键为 UUID v4 且 If-Match 精确保留 revision
 * [POS]: api/enterprise mutation 协议的快速回归门禁
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import { idempotencyHeaders, revisionHeaders } from './mutation';

describe('enterprise mutation headers', () => {
  it('creates a UUID v4 idempotency key for one logical create', () => {
    expect(idempotencyHeaders()).toEqual({
      'Idempotency-Key': expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      repeatSubmit: false
    });
  });

  it('serializes the current revision into If-Match', () => {
    expect(revisionHeaders(17)).toEqual({ 'If-Match': '17', repeatSubmit: false });
  });
});
