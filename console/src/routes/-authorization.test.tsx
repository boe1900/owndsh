/**
 * [INPUT]: 依赖完整路由树、内存 Router、Testing Library 和生成客户端的实际 fetch 请求。
 * [OUTPUT]: 验证 employee 直接确认原桌面事务、批准/取消账号绑定、未登录恢复和身份绑定强制新鲜认证。
 * [POS]: routes 的统一登录体验门禁，不模拟或绕过实际 PKCE/CSRF 参数装配。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { client } from '@/api/generated/client.gen';
import { clearSessionCache } from '@/auth/session';
import { routeTree } from '../routeTree.gen';

window.scrollTo = () => undefined;

const transaction = {
  transactionId: 'tx_original_desktop_transaction_000001',
  csrfToken: 'csrf_original_desktop_transaction_001',
  sources: [{ id: '1', name: '本地账户', type: 'LOCAL' }]
};
const account = { id: '1761100000000000003', username: 'employee', displayName: 'Employee' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data, requestId: 'req_auth' }), {
  status, headers: { 'content-type': 'application/json' }
});

afterEach(() => {
  cleanup(); clearSessionCache(); sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

function start(path: string, signedIn = true) {
  const decisions: unknown[] = [];
  const paths: string[] = [];
  client.setConfig({ baseUrl: 'http://localhost' });
  vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(new URL(String(input), window.location.origin), init);
    const url = new URL(request.url);
    paths.push(url.pathname);
    if (url.pathname.endsWith('/session')) return signedIn ? json(account) : json(null, 401);
    if (url.pathname.endsWith('/sources')) {
      expect(url.searchParams.get('transaction_id')).toBe(transaction.transactionId);
      return json(transaction);
    }
    if (url.pathname.endsWith('/authorize')) return json({ ...transaction, transactionId: 'tx_browser_login' });
    if (url.pathname.endsWith('/auth/code')) return json({ captchaEnabled: false });
    if (url.pathname.endsWith('/authorization')) {
      decisions.push(await request.json());
      return json(null, 400);
    }
    throw new Error(`Unexpected auth request ${url.pathname}`);
  }));
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) });
  render(<RouterProvider router={router} />);
  return { router, decisions, paths };
}

it.each([true, false])('confirms the displayed employee and original transaction for approved=%s', async approved => {
  const env = start(`/authorize?transaction_id=${transaction.transactionId}`);
  expect(await screen.findByText('Employee')).toBeTruthy();
  expect(screen.queryByLabelText('密码')).toBeNull();
  expect(env.decisions).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: approved ? '以 employee 继续' : '取消登录' }));
  await waitFor(() => expect(env.decisions).toEqual([{
    transactionId: transaction.transactionId, csrfToken: transaction.csrfToken, userId: account.id, approved
  }]));
  expect((await screen.findByRole('alert')).textContent).toContain('授权未能完成');
  expect(env.paths.some(path => path.includes('/admin/'))).toBe(false);
});

it('does not let a URL flag skip confirmation for an existing browser session', async () => {
  const env = start(`/authorize?transaction_id=${transaction.transactionId}&auto=1`);
  expect(await screen.findByRole('button', { name: '以 employee 继续' })).toBeTruthy();
  expect(env.decisions).toEqual([]);
});

it('restores the original Desktop authorization after browser login', async () => {
  const env = start(`/authorize?transaction_id=${transaction.transactionId}`, false);
  expect(await screen.findByLabelText('用户名')).toBeTruthy();
  await waitFor(() => expect(env.router.state.location.pathname).toBe('/login'));
  expect(env.router.state.location.search).toMatchObject({
    redirect: `/authorize?transaction_id=${transaction.transactionId}`
  });
  expect(JSON.parse(sessionStorage.getItem('enterprise-admin-pkce')!).returnTo)
    .toBe(`/authorize?transaction_id=${transaction.transactionId}`);
});

it('requires fresh credentials for an explicit legacy transaction even with an existing browser account', async () => {
  const env = start(`/login?transaction_id=${transaction.transactionId}&source_id=1`);
  expect(await screen.findByLabelText('用户名')).toBeTruthy();
  expect(screen.getByLabelText('密码')).toBeTruthy();
  expect(env.paths.some(path => path.endsWith('/session'))).toBe(false);
  expect(sessionStorage.getItem('enterprise-admin-pkce')).toBeNull();
});
