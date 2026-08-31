/**
 * [INPUT]: 依赖 Testing Library、Vitest、内存 history 与完整产品 routeTree。
 * [OUTPUT]: 验证 P2-02 产品壳、工作区菜单、Harness 按钮导航和业务路由可真实交互。
 * [POS]: routes 的最小集成门禁；文件名前缀让 TanStack 路由生成器忽略测试源码。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { routeTree } from '../routeTree.gen';

window.scrollTo = () => undefined;

afterEach(cleanup);

describe('product console', () => {
  it('renders the shell and navigates between product sections', async () => {
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
      routeTree
    });

    render(<RouterProvider router={router} />);

    expect((await screen.findAllByRole('complementary', { name: '产品导航' })).length).toBeGreaterThan(0);
    expect(await screen.findByRole('heading', { name: '模型' })).toBeTruthy();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Agent Platform' }))[0]!);
    expect(await screen.findByRole('button', { name: '组织设置' })).toBeTruthy();

    fireEvent.click((await screen.findAllByRole('button', { name: '成员' }))[0]!);

    expect(await screen.findByRole('heading', { name: '成员' })).toBeTruthy();
  });
});
