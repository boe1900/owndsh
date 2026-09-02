/**
 * [INPUT]: 依赖 Vitest 与 ActivityPage 使用的权限到分段映射。
 * [OUTPUT]: 验证角色只能得到 Server 权限允许的活动视图，mutation 权限不被分段映射伪造。
 * [POS]: features/activity 的最小授权门禁，补充 Server @SaCheckPermission 测试而不替代它。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { describe, expect, it } from 'vitest';
import { activitySectionsFor, sessionActionsFor } from './activity-page';

describe('activitySectionsFor', () => {
  it('maps auditor and specialist permissions without broadening writes', () => {
    const auditor = ['ent:usage:read', 'ent:audit:read', 'ent:session:read', 'ent:session:content:read'];
    expect(activitySectionsFor(auditor)).toEqual(['用量', '审计', 'Session']);
    expect(sessionActionsFor(auditor)).toEqual({ canReadContent: true, canDelete: false });
    expect(activitySectionsFor(['ent:plugin:read'])).toEqual(['运行异常']);
  });
});
