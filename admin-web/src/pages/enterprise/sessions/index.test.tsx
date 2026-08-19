/**
 * [INPUT]: 依赖 Testing Library、Session 页面及 mock Session API/权限状态
 * [OUTPUT]: 验证 metadata、独立正文/删除权限裁剪、事件时间线和 tombstone 删除刷新
 * [POS]: pages/enterprise/sessions 的管理行为门禁，真实授权与读取审计由 Server Playwright 验收
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let permissions: string[] = [];

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main>
}));
vi.mock('@/stores/userStore', () => ({
  useUserStore: (selector: (state: unknown) => unknown) => selector({ userInfo: { permissions } })
}));
vi.mock('@/api/request', () => ({ isHandledRequestError: () => false }));
vi.mock('@/api/enterprise/session', () => ({
  listAdminSessions: vi.fn().mockResolvedValue({
    data: {
      items: [{
        replicaId: '701',
        sessionId: 'session-t18',
        ownerUserId: '10031',
        ownerUsername: 'zhangsan',
        sourceDeviceId: '90018',
        sourceDeviceName: 'Zhang Mac',
        formatVersion: 0,
        lastSeq: 1,
        eventCount: 2,
        status: 'ACTIVE',
        createdAt: '2026-08-19T00:00:00Z',
        updatedAt: '2026-08-19T00:01:00Z',
        deletedAt: null
      }],
      page: { hasMore: false, limit: 50, nextCursor: null }
    }
  }),
  readAdminSessionContent: vi.fn().mockResolvedValue({
    sessionId: 'session-t18',
    header: { version: 0, id: 'session-t18', createdAt: 1, cwd: '/workspace' },
    title: '修复退款问题',
    fromSeq: 0,
    toSeq: 1,
    eventCount: 2,
    events: [
      { type: 'user/message', seq: 0, time: 1, data: { content: '请检查退款逻辑' } },
      { type: 'extension/custom', seq: 1, time: 2, data: { safe: true } }
    ],
    hasMore: false
  }),
  deleteAdminSession: vi.fn().mockResolvedValue({})
}));

import { deleteAdminSession, listAdminSessions, readAdminSessionContent } from '@/api/enterprise/session';
import SessionsPage from './index';

describe('Session management page', () => {
  beforeEach(() => {
    permissions = [];
    vi.clearAllMocks();
  });

  it('renders metadata but hides independently protected content and delete actions', async () => {
    render(<SessionsPage />);
    expect(await screen.findByText('session-t18')).toBeInTheDocument();
    expect(screen.getByText('Zhang Mac')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /查看正文/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /删除/ })).not.toBeInTheDocument();
  });

  it('pages authorized content and labels unknown events without persisting transport fields', async () => {
    permissions = ['ent:session:content:read'];
    render(<SessionsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /查看正文/ }));

    expect(await screen.findByText('修复退款问题')).toBeInTheDocument();
    expect(screen.getByText('请检查退款逻辑')).toBeInTheDocument();
    expect(screen.getByText('当前管理端未识别')).toBeInTheDocument();
    expect(screen.getByText('extension/custom')).toBeInTheDocument();
    expect(readAdminSessionContent).toHaveBeenCalledWith('701', 0, 100);
    expect(document.body.textContent).not.toMatch(/payloadBase64|rollingHash/);
  });

  it('confirms ACTIVE deletion and reloads metadata', async () => {
    permissions = ['ent:session:delete'];
    render(<SessionsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /删除/ }));
    const deleteButtons = await screen.findAllByRole('button', { name: /删\s*除/ });
    fireEvent.click(deleteButtons.at(-1)!);

    await waitFor(() => expect(deleteAdminSession).toHaveBeenCalledWith('701'));
    await waitFor(() => expect(listAdminSessions).toHaveBeenCalledTimes(2));
  });
});
