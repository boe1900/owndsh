/**
 * [INPUT]: 依赖 Session API facade、node:buffer UTF-8 fixture 与 mock OpenAPI content/delete operation
 * [OUTPUT]: 验证 LF JSONL 最小投影、坏范围/编码拒绝和 replicaId 删除传递
 * [POS]: api/enterprise/session 的不可信正文回归测试，不复制服务端授权或 hash 算法
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/enterprise/listAdminSessions', () => ({ listAdminSessions: vi.fn() }));
vi.mock('@/services/enterprise/readAdminSessionContent', () => ({ readAdminSessionContent: vi.fn() }));
vi.mock('@/services/enterprise/deleteAdminSession', () => ({ deleteAdminSession: vi.fn() }));

import { deleteAdminSession as generatedDelete } from '@/services/enterprise/deleteAdminSession';
import { readAdminSessionContent as generatedRead } from '@/services/enterprise/readAdminSessionContent';
import { decodeAdminSessionEvents, deleteAdminSession, readAdminSessionContent } from './index';

const event = { type: 'user/message', seq: 0, time: 1, data: { content: 'hello' } };

function content(payload = `${JSON.stringify(event)}\n`) {
  return {
    sessionId: 'session-t18',
    header: { version: 0, id: 'session-t18', createdAt: 1, cwd: '/workspace' },
    title: 'T18 Session',
    fromSeq: 0,
    toSeq: 0,
    eventCount: 1,
    previousRollingHash: `${'A'.repeat(43)}=`,
    rollingHash: `${'B'.repeat(43)}=`,
    payloadSha256: `${'C'.repeat(43)}=`,
    payloadBase64: Buffer.from(payload, 'utf8').toString('base64'),
    hasMore: false,
  };
}

describe('Session management API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('decodes canonical JSONL and discards transport bytes before returning content', async () => {
    vi.mocked(generatedRead).mockResolvedValue({ data: content(), requestId: `req_${'1'.repeat(26)}` });

    await expect(readAdminSessionContent('701', 0, 50)).resolves.toEqual({
      sessionId: 'session-t18',
      header: { version: 0, id: 'session-t18', createdAt: 1, cwd: '/workspace' },
      title: 'T18 Session',
      fromSeq: 0,
      toSeq: 0,
      eventCount: 1,
      events: [event],
      hasMore: false,
    });
    expect(generatedRead).toHaveBeenCalledWith({ replicaId: '701', fromSeq: 0, limit: 50 });
  });

  it('rejects CRLF, sequence drift, and non-canonical Base64', () => {
    expect(() => decodeAdminSessionEvents(content(`${JSON.stringify(event)}\r\n`))).toThrow(/canonical JSONL/);
    expect(() => decodeAdminSessionEvents({ ...content(), toSeq: 2 })).toThrow(/range/);
    expect(() => decodeAdminSessionEvents({ ...content(), payloadBase64: '%%%%' })).toThrow(/UTF-8/);
    expect(() => decodeAdminSessionEvents({ ...content(), payloadBase64: 'YR==' })).toThrow(/UTF-8/);
  });

  it('deletes only the explicit server replica resource', async () => {
    vi.mocked(generatedDelete).mockResolvedValue({
      data: { replicaId: '701', sessionId: 'session-t18', status: 'DELETED', deletedAt: '2026-08-19T00:00:00Z' },
      requestId: `req_${'2'.repeat(26)}`,
    });
    await deleteAdminSession('701');
    expect(generatedDelete).toHaveBeenCalledWith({ replicaId: '701' });
  });
});
