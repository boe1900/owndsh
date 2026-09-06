/**
 * [INPUT]: 依赖 Vitest 与 ActivityPage 使用的权限到分段映射。
 * [OUTPUT]: 验证活动权限边界，以及未知用量不被显示为实测零值或预估输出。
 * [POS]: features/activity 的最小授权门禁，补充 Server @SaCheckPermission 测试而不替代它。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import { activitySectionsFor, measuredTokens } from './activity-page';

describe('activitySectionsFor', () => {
  it('maps auditor and specialist permissions without broadening writes', () => {
    const auditor = ['ent:usage:read', 'ent:audit:read', 'ent:session:read', 'ent:session:content:read'];
    expect(activitySectionsFor(auditor)).toEqual(['用量', '审计']);
    expect(activitySectionsFor(['ent:plugin:read'])).toEqual(['运行异常']);
  });
  it('distinguishes unknown usage from measured zero', () => {
    expect(measuredTokens(0, 'CHARGED_MAX')).toBe('-');
    expect(measuredTokens(640, 'CHARGED_MAX')).toBe('-');
    expect(measuredTokens(0, 'SETTLED')).toBe('0');
    expect(measuredTokens(15, 'SETTLED')).toBe('15');
  });
});
