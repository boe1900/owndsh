/**
 * [INPUT]: 依赖 Vitest、浏览器 Base64 原语与 Session 正文严格解码器。
 * [OUTPUT]: 验证规范 JSONL 可读，非规范 Base64、范围漂移和非法事件被拒绝。
 * [POS]: features/activity 的正文安全门禁，防止浏览器宽松解码掩盖传输损坏。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import type { SessionExport } from '@/api/generated/types.gen';
import { decodeAdminSessionEvents } from './session-content';

function content(payload: string): SessionExport {
  return {
    sessionId: 'session-1',
    header: { version: 0, id: 'session-1', createdAt: 1 },
    title: '测试',
    fromSeq: 4,
    toSeq: 4,
    eventCount: 1,
    previousRollingHash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    rollingHash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    payloadSha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    payloadBase64: btoa(payload),
    hasMore: false
  };
}

describe('decodeAdminSessionEvents', () => {
  it('accepts only canonical continuous JSONL', () => {
    expect(decodeAdminSessionEvents(content('{"type":"user/message","seq":4,"time":1,"data":{"content":"hi"}}\n')))
      .toEqual([{ type: 'user/message', seq: 4, time: 1, data: { content: 'hi' } }]);

    expect(() => decodeAdminSessionEvents({ ...content('x'), payloadBase64: 'YR==' })).toThrow('valid UTF-8');
    expect(() => decodeAdminSessionEvents(content('{"type":"x","seq":5,"time":1,"data":null}\n'))).toThrow('event envelope');
    expect(() => decodeAdminSessionEvents(content('{"type":"x","seq":4,"time":1,"data":null}'))).toThrow('canonical JSONL');
  });
});
