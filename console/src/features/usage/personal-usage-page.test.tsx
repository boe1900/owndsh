/**
 * [INPUT]: 依赖 Testing Library、Vitest 与 PersonalUsagePage。
 * [OUTPUT]: 验证个人用量静态页签默认展示模型用量分布、趋势图、示例数据标注与时间范围切换联动。
 * [POS]: features/usage 的行为门禁，防止静态占位页布局或交互回归。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PersonalUsagePage } from './personal-usage-page';

afterEach(() => {
  cleanup();
});

describe('PersonalUsagePage', () => {
  it('renders personal usage overview, model distribution and switches time windows', async () => {
    render(<PersonalUsagePage />);

    expect(screen.getByRole('heading', { name: '个人用量' })).toBeTruthy();
    expect(screen.getByText('示例数据 · 待接入个人用量接口')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '模型用量分布' })).toBeTruthy();
    expect(screen.getByRole('region', { name: '近期调用明细' })).toBeTruthy();
    expect(screen.getByPlaceholderText('搜索模型名称或别名')).toBeTruthy();
    expect(screen.getByText('2.84M')).toBeTruthy();
    expect(screen.getByText('占比 52.1%')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: '本月' }));

    expect(screen.getByText('9.92M')).toBeTruthy();
    expect(screen.getByText('占比 45%')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: '自定义' }));
    expect(await screen.findByText('自定义时间范围')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-03-10' } });
    fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-03-01' } });
    fireEvent.click(screen.getByRole('button', { name: '应用范围' }));
    expect(screen.getByText('开始日期不能晚于结束日期')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-03-14' } });
    fireEvent.click(screen.getByRole('button', { name: '应用范围' }));

    expect(screen.getByText('5.68M')).toBeTruthy();
    expect(screen.getByRole('tab', { name: '03-01 ~ 03-14' })).toBeTruthy();
  });
});
