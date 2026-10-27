/**
 * [INPUT]: 依赖模型编辑器导出的 Provider ID 配色规则与 Vitest。
 * [OUTPUT]: 锁定供应商改名后仍保持同一渐变，避免颜色依赖展示名称。
 * [POS]: features/models 的视觉身份规则门禁，不渲染具体表单。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import { providerGradient } from './model-editors';

describe('providerGradient', () => {
  it('uses the stable provider id instead of the display name', () => {
    expect(providerGradient('provider-1', 'OpenAI')).toBe(providerGradient('provider-1', 'Renamed provider'));
    expect(providerGradient(undefined, 'Custom provider')).toMatch(/^from-[a-z0-9-]+ to-[a-z0-9-]+$/);
  });
});
