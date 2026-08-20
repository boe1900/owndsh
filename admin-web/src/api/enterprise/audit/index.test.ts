/**
 * [INPUT]: 依赖 Vitest、生成 audit operation mock 与严格 audit facade
 * [OUTPUT]: 验证筛选/cursor 透传、双记录关联和未知敏感 metadata 拒绝
 * [POS]: api/enterprise/audit 的浏览器信任边界门禁
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/enterprise/listAuditEvents', () => ({ listAuditEvents: vi.fn() }));

import { listAuditEvents as generated } from '@/services/enterprise/listAuditEvents';
import { listAuditEvents } from './index';

const requestId = `req_${'1'.repeat(26)}`;

function response(metadata: Record<string, unknown>) {
  return {
    data: {
      items: [{
        id: '1', occurredAt: '2026-08-20T03:00:00Z', actorType: 'USER' as const,
        actorId: '1001', deviceId: '9001', action: 'MODEL_REQUEST_ACCEPTED' as const,
        resourceType: 'MODEL_REQUEST', resourceId: 'reservation-1', result: 'SUCCESS' as const,
        reasonCode: null, requestId, metadata
      }],
      page: { hasMore: false, limit: 50, nextCursor: null }
    },
    requestId
  };
}

describe('audit API facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes association filters and projects known scalar metadata', async () => {
    vi.mocked(generated).mockResolvedValue(response({ modelId: 7, reservationId: 'r-1', estimatedTokens: 42 }));

    const result = await listAuditEvents({ requestId }, 'opaque', 25);

    expect(generated).toHaveBeenCalledWith({ requestId, cursor: 'opaque', limit: 25 });
    expect(result.data.items[0].metadata).toEqual({ modelId: 7, reservationId: 'r-1', estimatedTokens: 42 });
  });

  it('rejects unknown sensitive or nested metadata before React state', async () => {
    vi.mocked(generated).mockResolvedValue(response({ modelId: 7, reservationId: 'r-1', estimatedTokens: 42, prompt: 'secret' }));
    await expect(listAuditEvents({})).rejects.toThrow(/prompt/);

    vi.mocked(generated).mockResolvedValue(response({ modelId: 7, reservationId: { nested: true }, estimatedTokens: 42 }));
    await expect(listAuditEvents({})).rejects.toThrow(/reservationId/);
  });
});
