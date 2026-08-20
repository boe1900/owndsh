/**
 * [INPUT]: 依赖 Testing Library、审计页面及 mock 严格 audit API
 * [OUTPUT]: 验证同 requestId 双记录、核心账本字段和 metadata 抽屉按需展示
 * [POS]: pages/enterprise/audit 的只读行为门禁，真实权限由 Server Playwright 验收
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ant-design/pro-components', () => ({ PageContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/api/enterprise/audit', () => ({
  AUDIT_ACTIONS: ['MODEL_REQUEST_ACCEPTED', 'MODEL_REQUEST_FINISHED'],
  listAuditEvents: vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: '1', occurredAt: '2026-08-20T03:00:00Z', actorType: 'USER', actorId: '1001', deviceId: '9001',
            action: 'MODEL_REQUEST_ACCEPTED', resourceType: 'MODEL_REQUEST', resourceId: 'reservation-1',
            result: 'SUCCESS', reasonCode: null, requestId: `req_${'1'.repeat(26)}`,
            metadata: { modelId: 7, estimatedTokens: 42 }
          },
          {
            id: '2', occurredAt: '2026-08-20T03:00:01Z', actorType: 'USER', actorId: '1001', deviceId: '9001',
            action: 'MODEL_REQUEST_FINISHED', resourceType: 'MODEL_REQUEST', resourceId: 'reservation-1',
            result: 'SUCCESS', reasonCode: null, requestId: `req_${'1'.repeat(26)}`,
            metadata: { modelId: 7, outcome: 'SETTLED', chargedTokens: 31 }
          }
        ],
        page: { hasMore: false, limit: 50, nextCursor: null }
      }
    })
}));

import AuditPage from './index';

describe('audit management page', () => {
  it('renders correlated records and reveals only selected metadata', async () => {
    render(<AuditPage />);

    expect(await screen.findByText('MODEL_REQUEST_ACCEPTED')).toBeInTheDocument();
    expect(screen.getByText('MODEL_REQUEST_FINISHED')).toBeInTheDocument();
    expect(screen.getAllByText(`req_${'1'.repeat(26)}`)).toHaveLength(2);
    expect(screen.queryByText('estimatedTokens')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /Metadata/ })[0]);
    expect(await screen.findByText('estimatedTokens')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});
