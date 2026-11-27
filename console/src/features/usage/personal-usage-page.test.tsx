/**
 * [INPUT]: 依赖生成 SDK、TanStack Query、Testing Library 和可控的本人用量响应。
 * [OUTPUT]: 验证真实字段映射、时间筛选、明细续页、失败重试和空数据状态。
 * [POS]: features/usage 的接口对接回归。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { client } from '@/api/generated/client.gen';
import type { GetPersonalUsageResponse } from '@/api/generated/types.gen';
import { PersonalUsagePage } from './personal-usage-page';

const data: GetPersonalUsageResponse['data'] = {
  start: '2026-03-01',
  end: '2026-03-14',
  timeZone: 'Asia/Shanghai',
  summary: { requests: 2, inputTokens: 1_500_000, outputTokens: 300_000, cacheTokens: 200_000,
    totalTokens: 2_000_000, chargedTokens: 2_000_300, unmeasuredRequests: 1 },
  outcomes: { finished: 2, successful: 1 },
  models: [{ id: '101', alias: 'test-model', name: '测试模型', inputTokens: 1_500_000,
    outputTokens: 300_000, totalTokens: 2_000_000, requests: 2 }],
  dailyTrend: [{ date: '2026-03-01', tokens: 2_000_000 }, { date: '2026-03-02', tokens: 0 }],
  items: [{ id: '11', modelName: '测试模型', modelAlias: 'test-model', createdAt: '2026-03-01T08:00:00Z',
    inputTokens: 0, outputTokens: 0, totalTokens: 0, result: 'CHARGED_MAX' }],
  page: { hasMore: true, nextCursor: 'next-page', limit: 50 }
};

function renderUsage() {
  client.setConfig({ baseUrl: 'http://localhost' });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PersonalUsagePage memberId="42" />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('uses the signed-in endpoint, plots measured usage and loads another page', async () => {
  const queries: URL[] = [];
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    queries.push(url);
    const page = url.searchParams.has('cursor')
      ? { ...data, items: [{ ...data.items[0]!, id: '12', modelName: '上一页模型', result: 'SETTLED' }],
        page: { hasMore: false, nextCursor: null, limit: 50 } }
      : data;
    return Response.json({ data: page });
  }));
  renderUsage();

  expect(await screen.findByRole('heading', { name: '模型用量分布' })).toBeTruthy();
  expect(screen.getByText('调用成功率 50%')).toBeTruthy();
  expect(screen.getByText('1 次调用用量未知')).toBeTruthy();
  expect(screen.getByTitle('2026-03-01 · 2,000,000 Tokens')).toBeTruthy();
  expect(queries[0]?.pathname).toBe('/enterprise/console/v1/usage');
  expect(queries[0]?.searchParams.has('userId')).toBe(false);
  expect(queries[0]?.searchParams.get('range')).toBe('7d');

  fireEvent.click(screen.getByRole('button', { name: /加载更多/ }));
  expect(await screen.findByText('上一页模型')).toBeTruthy();
  expect(queries.at(-1)?.searchParams.get('cursor')).toBe('next-page');

  fireEvent.click(screen.getByRole('tab', { name: '本月' }));
  await waitFor(() => expect(queries.at(-1)?.searchParams.get('range')).toBe('month'));
  expect(await screen.findByRole('heading', { name: '模型用量分布' })).toBeTruthy();

  fireEvent.click(screen.getByRole('tab', { name: '自定义' }));
  expect(await screen.findByText('自定义时间范围')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-03-10' } });
  fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-03-01' } });
  fireEvent.click(screen.getByRole('button', { name: '应用范围' }));
  expect(screen.getByText('开始日期不能晚于结束日期')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-03-01' } });
  fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-03-14' } });
  fireEvent.click(screen.getByRole('button', { name: '应用范围' }));
  await waitFor(() => expect(Object.fromEntries(queries.at(-1)!.searchParams)).toEqual({
    range: 'custom', start: '2026-03-01', end: '2026-03-14'
  }));
});

it('shows the server error and can recover to an empty dashboard', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ error: { message: '会话已过期' } }, { status: 401 }))
    .mockResolvedValueOnce(Response.json({ data: {
      ...data,
      summary: { requests: 0, inputTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0,
        chargedTokens: 0, unmeasuredRequests: 0 },
      outcomes: { finished: 0, successful: 0 }, models: [], items: [],
      dailyTrend: [{ date: '2026-03-01', tokens: 0 }], page: { hasMore: false, nextCursor: null, limit: 50 }
    } }));
  vi.stubGlobal('fetch', fetch);
  renderUsage();

  expect(await screen.findByText('会话已过期')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByText('暂无模型用量')).toBeTruthy();
  expect(screen.getByText('暂无个人调用明细')).toBeTruthy();
});
