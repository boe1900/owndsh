/**
 * [INPUT]: 依赖 Testing Library、Vitest 与根路径模型页面。
 * [OUTPUT]: 验证 P2-01 首屏可渲染且暴露唯一模型标题。
 * [POS]: routes 的最小 smoke 门禁；文件名前缀让 TanStack 路由生成器忽略测试源码。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ModelsIndexPage } from './-models-index-page';

afterEach(cleanup);

describe('models index', () => {
  it('renders the model empty state', () => {
    render(<ModelsIndexPage />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('模型');
    expect(screen.getByRole('heading', { name: '暂无模型' })).toBeTruthy();
  });
});
