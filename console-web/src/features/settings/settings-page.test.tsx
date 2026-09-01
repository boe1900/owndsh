/**
 * [INPUT]: 依赖 Testing Library、TanStack Query、Vitest 与独立 ServiceHealth 区块。
 * [OUTPUT]: 验证健康请求失败保留区块、显示错误并允许显式重试。
 * [POS]: features/settings 的健康状态最小门禁，不复制 deploy 端健康状态机。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceHealth } from './settings-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ServiceHealth', () => {
  it('keeps the settings surface available and retries a failed health check', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"status":"UP"}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    render(<QueryClientProvider client={new QueryClient()}><ServiceHealth /></QueryClientProvider>);

    expect(await screen.findByText('不可用')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('503');
    fireEvent.click(screen.getByRole('button', { name: '重新检查服务健康' }));
    await waitFor(() => expect(screen.getByText('UP')).toBeTruthy());
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
