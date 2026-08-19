/**
 * [INPUT]: 依赖 Testing Library、身份源页面及 mock OpenAPI 业务边界/权限状态
 * [OUTPUT]: 验证写按钮权限分支、新建类型边界与表单必填校验
 * [POS]: identity-sources 页面行为门禁，不断言样式类名
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let permissions: string[] = [];

vi.mock('@ant-design/pro-components', () => ({
  PageContainer: ({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) => (
    <main>
      {extra}
      {children}
    </main>
  )
}));
vi.mock('@/stores/userStore', () => ({
  useUserStore: (selector: (state: unknown) => unknown) => selector({ userInfo: { permissions } })
}));
vi.mock('@/api/enterprise/identity', () => ({
  checkIdentitySource: vi.fn(),
  createGroupMapping: vi.fn(),
  createIdentitySource: vi.fn(),
  deleteGroupMapping: vi.fn(),
  getIdentitySource: vi.fn(),
  listGroupMappings: vi.fn().mockResolvedValue({ data: { items: [], page: { hasMore: false, nextCursor: null } } }),
  listIdentitySources: vi.fn().mockResolvedValue({
    data: {
      items: [
        {
          id: '1900600000000000001',
          type: 'OIDC',
          name: 'Corporate SSO',
          issuer: 'https://id.example.test',
          clientId: 'admin-web',
          oidc: { scopes: ['openid'], claims: { username: 'sub', displayName: 'name' } },
          secretConfigured: true,
          status: 'ACTIVE',
          revision: 0,
          createdAt: '2026-08-19T00:00:00Z',
          updatedAt: '2026-08-19T00:00:00Z'
        }
      ],
      page: { hasMore: false, limit: 50, nextCursor: null }
    }
  }),
  setIdentitySourceEnabled: vi.fn(),
  updateIdentitySource: vi.fn()
}));
vi.mock('../shared/revision', () => ({ recoverRevisionConflict: vi.fn() }));

import { createIdentitySource } from '@/api/enterprise/identity';
import IdentitySourcesPage from './index';

const createIdentitySourceMock = vi.mocked(createIdentitySource);

describe('identity sources permissions and validation', () => {
  beforeEach(() => {
    permissions = [];
  });

  it('hides mutation actions without ent:identity:write', async () => {
    render(<IdentitySourcesPage />);
    expect(await screen.findByText('Corporate SSO')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /新建身份源/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
  });

  it('blocks an incomplete identity source before calling the API', async () => {
    permissions = ['ent:identity:write'];
    render(<IdentitySourcesPage />);
    fireEvent.click(await screen.findByRole('button', { name: /新建身份源/ }));
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }));

    await waitFor(() => expect(screen.getByRole('textbox', { name: '名称' })).toHaveAttribute('aria-invalid', 'true'));
    expect(createIdentitySourceMock).not.toHaveBeenCalled();
  });

  it('only offers configurable external source types when creating', async () => {
    permissions = ['ent:identity:write'];
    render(<IdentitySourcesPage />);
    fireEvent.click(await screen.findByRole('button', { name: /新建身份源/ }));

    fireEvent.mouseDown(screen.getByRole('combobox', { name: '类型' }));

    expect(await screen.findByRole('option', { name: 'OIDC' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'LDAP' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'LOCAL' })).not.toBeInTheDocument();
  });
});
