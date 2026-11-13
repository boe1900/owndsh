/**
 * [INPUT]: 依赖 Vitest、Testing Library、Query 与 ActivityPage，HTTP 使用可控响应。
 * [OUTPUT]: 验证用量/审计分段与权限边界，以及未知用量不被显示为实测零值或预估输出。
 * [POS]: features/activity 的最小授权门禁，补充 Server @SaCheckPermission 测试而不替代它。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '@/api/generated/client.gen';
import { ActivityPage, activitySectionsFor, measuredTokens } from './activity-page';

describe('activitySectionsFor', () => {
  it('maps auditor and specialist permissions without broadening writes', () => {
    const auditor = ['ent:usage:read', 'ent:audit:read', 'ent:session:read', 'ent:session:content:read'];
    expect(activitySectionsFor(auditor)).toEqual(['用量', '审计']);
    expect(activitySectionsFor(['ent:plugin:read'])).toEqual([]);
    expect(activitySectionsFor(['ent:audit:read'])).toEqual(['审计']);
    expect(activitySectionsFor(['ent:usage:read'])).toEqual(['用量']);
  });
  it('distinguishes unknown usage from measured zero', () => {
    expect(measuredTokens(0, 'CHARGED_MAX')).toBe('-');
    expect(measuredTokens(640, 'CHARGED_MAX')).toBe('-');
    expect(measuredTokens(0, 'SETTLED')).toBe('0');
    expect(measuredTokens(15, 'SETTLED')).toBe('15');
  });
});

const access = vi.hoisted(() => ({ permissions: ['ent:usage:read', 'ent:audit:read'] }));
vi.mock('@tanstack/react-router', () => ({ useRouteContext: () => ({ bootstrap: access }) }));
let requests: string[];
beforeEach(() => {
  access.permissions = ['ent:usage:read', 'ent:audit:read'];
  requests = [];
  client.setConfig({ baseUrl: 'http://localhost' });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    requests.push(new URL(request.url).pathname);
    return new Response(JSON.stringify({ data: { items: [], page: { hasMore: false, nextCursor: null, limit: 100 } } }),
      { headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ActivityPage /></QueryClientProvider>);
}

it('loads usage and audit independently through their remaining tabs', async () => {
  show();
  await screen.findByText('暂无模型用量');
  expect(screen.queryByRole('tab', { name: '运行异常' })).toBeNull();
  expect(requests).toEqual(['/enterprise/admin/v1/usage']);
  fireEvent.click(screen.getByRole('tab', { name: '审计' }));
  await screen.findByText('暂无审计事件');
  expect(requests).toEqual(['/enterprise/admin/v1/usage', '/enterprise/admin/v1/audit-events']);
});

it('does not query activity data for plugin read permission alone', () => {
  access.permissions = ['ent:plugin:read'];
  show();
  expect(screen.getByText('当前角色没有可读取的活动数据')).toBeTruthy();
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(requests).toEqual([]);
});
