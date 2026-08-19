/**
 * [INPUT]: 依赖 Testing Library、插件页面及 mock 插件业务 API/权限状态
 * [OUTPUT]: 验证插件读取渲染和写权限裁剪；版本/assignment 交互由 API 单测与真实 Playwright 覆盖
 * [POS]: plugins 页面行为门禁，不复制服务端插件裁决
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let permissions: string[] = [];

const pluginPackage = {
  id: '101',
  packageName: '@example/t15-tools',
  displayName: 'T15 Tools',
  status: 'ACTIVE' as const,
  revision: 7,
  versions: [
    {
      id: '202',
      packageId: '101',
      packageName: '@example/t15-tools',
      version: '2.0.0',
      sizeBytes: 1024,
      sha256: 'b'.repeat(64),
      signatureBase64: 'A'.repeat(86) + '==',
      compatibility: {
        harnessCommits: ['99f6f02fecdb7dff40c3fbc9470f5907c29f74ca'],
        enterpriseBundleRange: '>=0.1.0 <0.2.0',
        operatingSystems: ['darwin' as const]
      },
      status: 'VALIDATED' as const,
      createdAt: '2026-08-19T04:00:00Z',
      revision: 1
    },
    {
      id: '201',
      packageId: '101',
      packageName: '@example/t15-tools',
      version: '1.0.0',
      sizeBytes: 512,
      sha256: 'a'.repeat(64),
      signatureBase64: 'A'.repeat(86) + '==',
      compatibility: {
        harnessCommits: ['99f6f02fecdb7dff40c3fbc9470f5907c29f74ca'],
        enterpriseBundleRange: '>=0.1.0 <0.2.0',
        operatingSystems: ['darwin' as const]
      },
      status: 'PUBLISHED' as const,
      createdAt: '2026-08-19T03:00:00Z',
      revision: 2
    }
  ],
  assignments: [
    {
      id: '301',
      packageId: '101',
      pluginVersionId: '201',
      subjectType: 'ALL' as const,
      subjectId: null,
      desiredState: 'INSTALLED' as const,
      required: false,
      status: 'ACTIVE' as const,
      revision: 0
    }
  ]
};

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main>
}));
vi.mock('@/stores/userStore', () => ({
  useUserStore: (selector: (state: unknown) => unknown) => selector({ userInfo: { permissions } })
}));
vi.mock('@/api/request', () => ({ isHandledRequestError: (error: { isHandled?: boolean }) => Boolean(error?.isHandled) }));
vi.mock('@/api/enterprise/plugin', () => ({
  listPluginPackages: vi.fn().mockImplementation(async () => ({
    data: { items: [pluginPackage], page: { hasMore: false, limit: 50, nextCursor: null } }
  })),
  listPluginInventory: vi.fn().mockResolvedValue({
    data: { items: [], page: { hasMore: false, limit: 50, nextCursor: null } }
  }),
  publishPluginVersion: vi.fn().mockResolvedValue({}),
  replacePluginAssignments: vi.fn().mockResolvedValue({}),
  retirePluginVersion: vi.fn().mockResolvedValue({}),
  uploadPluginVersion: vi.fn().mockResolvedValue({})
}));
vi.mock('../shared/revision', () => ({ recoverRevisionConflict: vi.fn().mockResolvedValue(false) }));

import PluginsPage from './index';

describe('plugin management page', () => {
  beforeEach(() => {
    permissions = [];
  });

  it('hides mutation actions without ent:plugin:write', async () => {
    render(<PluginsPage />);

    expect(await screen.findByText('T15 Tools')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /上传插件/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /分配与回滚/ })).not.toBeInTheDocument();
  });

  it('shows upload and assignment actions with ent:plugin:write', async () => {
    permissions = ['ent:plugin:write'];
    render(<PluginsPage />);

    expect(await screen.findByRole('button', { name: /上传插件/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /分配与回滚/ })).toBeInTheDocument();
  });
});
