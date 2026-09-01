/**
 * [INPUT]: 依赖 Testing Library、Vitest、内存 history、静态角色元数据与完整产品 routeTree。
 * [OUTPUT]: 验证五角色矩阵、认证/主题、成员 cursor/详情/角色/身份 CAS、模型/访问策略/插件写入和 Sign out。
 * [POS]: routes 的产品壳最小集成门禁，覆盖前端可见性但不替代 Server ent:* 权限测试。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from '@/api/generated/client.gen';
import type { AuthBuiltInRole } from '@/api/generated/types.gen';
import { productRoutesFor } from '@/app/product-routes';
import { completeEnterpriseAdminLogin } from '@/auth/pkce';
import { clearSession, getToken, setToken } from '@/auth/session';
import { routeTree } from '../routeTree.gen';

window.scrollTo = () => undefined;
client.setConfig({ baseUrl: 'http://localhost' });

afterEach(() => {
  cleanup();
  clearSession();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.classList.remove('dark', 'theme-switching');
  vi.unstubAllGlobals();
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

type CapturedWrite = {
  body: unknown;
  idempotencyKey: string | null;
  ifMatch: string | null;
  method: string;
  pathname: string;
};

function memberDetail(roles: AuthBuiltInRole[] = ['employee'], status = 'ACTIVE', revision = 1) {
  return {
    member: {
      id: '202', username: 'developer.one', displayName: 'Developer One', status,
      roles, loginMethods: [], lastActiveAt: null, revision
    },
    identities: [{
      identityId: null, sourceId: null, sourceName: '本地', sourceType: 'LOCAL',
      subject: '202', lastLoginAt: null
    }, {
      identityId: '1919100000000000291', sourceId: '1919100000000000191',
      sourceName: 'Corporate LDAP', sourceType: 'LDAP', subject: 'stable-subject',
      lastLoginAt: '2026-09-01T05:00:00Z'
    }],
    devices: [{
      id: '1919100000000000202', name: 'Developer Mac', platform: 'darwin-arm64',
      status: 'ACTIVE', lastSeenAt: '2026-09-01T05:10:00Z'
    }],
    sessions: { active: 2, deleted: 1, expired: 0, latestUpdatedAt: '2026-09-01T05:09:00Z' }
  };
}

function mockApi(role: AuthBuiltInRole, logoutStatus = 200, permissions: string[] = []) {
  const writes: CapturedWrite[] = [];
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (pathname.endsWith('/enterprise/admin/v1/bootstrap')) {
      return json({
        data: {
          member: { id: '101', displayName: 'Candidate Admin', avatarUrl: null },
          roles: [role],
          permissions,
          deployment: { name: 'Enterprise Agent Platform' }
        },
        requestId: 'req_test'
      });
    }
    if (pathname.endsWith('/enterprise/admin/v1/members/202/roles')) {
      const body = await request.clone().json() as { roles: AuthBuiltInRole[] };
      writes.push({
        body,
        idempotencyKey: request.headers.get('Idempotency-Key'),
        ifMatch: request.headers.get('If-Match'),
        method: request.method,
        pathname
      });
      return json({ data: memberDetail(body.roles, 'ACTIVE', 2), requestId: 'req_member_roles' });
    }
    if (pathname.endsWith('/enterprise/admin/v1/members/202/status')) {
      const body = await request.clone().json() as { status: string };
      writes.push({
        body,
        idempotencyKey: request.headers.get('Idempotency-Key'),
        ifMatch: request.headers.get('If-Match'),
        method: request.method,
        pathname
      });
      return json({ data: memberDetail(['employee'], body.status, 2), requestId: 'req_member_status' });
    }
    if (pathname.endsWith('/enterprise/admin/v1/members/202/identities/1919100000000000291')) {
      writes.push({
        body: null,
        idempotencyKey: request.headers.get('Idempotency-Key'),
        ifMatch: request.headers.get('If-Match'),
        method: request.method,
        pathname
      });
      const updated = memberDetail(['employee'], 'ACTIVE', 2);
      return json({
        data: { ...updated, identities: updated.identities.filter((identity) => identity.identityId === null) },
        requestId: 'req_member_identity_unlinked'
      });
    }
    if (pathname.endsWith('/enterprise/admin/v1/members/202')) {
      return json({ data: memberDetail(), requestId: 'req_member_detail' });
    }
    if (pathname.endsWith('/enterprise/admin/v1/members')) {
      const secondPage = url.searchParams.get('cursor') === 'member-next';
      return json({
        data: {
          items: secondPage ? [{
            id: '303', username: 'developer.two', displayName: 'Developer Two', status: 'ACTIVE',
            roles: ['employee'], loginMethods: [], lastActiveAt: null, revision: 0
          }] : [{
            id: '202', username: 'developer.one', displayName: 'Developer One', status: 'ACTIVE',
            roles: ['employee'], loginMethods: [], lastActiveAt: null, revision: 1
          }],
          page: { hasMore: !secondPage, limit: 200, nextCursor: secondPage ? null : 'member-next' }
        },
        requestId: secondPage ? 'req_members_2' : 'req_members_1'
      });
    }
    if (pathname.endsWith('/enterprise/admin/v1/identity-sources')) {
      return json({
        data: {
          items: [{
            id: '1919100000000000191', type: 'LDAP', name: 'Corporate LDAP',
            ldap: { url: 'ldaps://ldap.example.test', baseDn: 'dc=example,dc=test', userFilter: '(uid={0})',
              usernameAttribute: 'uid', stableIdAttribute: 'entryUUID', displayNameAttribute: 'displayName',
              emailAttribute: 'mail', groupAttribute: 'memberOf', startTls: false },
            secretConfigured: true, status: 'ACTIVE', revision: 0,
            createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z'
          }, {
            id: '1919100000000000192', type: 'OIDC', name: 'Microsoft Entra',
            issuer: 'https://login.example.test', clientId: 'enterprise-console',
            oidc: { scopes: ['openid'], claims: { subject: 'sub', username: 'preferred_username',
              displayName: 'name', email: 'email', groups: 'groups' } },
            secretConfigured: true, status: 'ACTIVE', revision: 0,
            createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z'
          }],
          page: { hasMore: false, limit: 200, nextCursor: null }
        },
        requestId: 'req_identity_sources'
      });
    }
    if (pathname.endsWith('/enterprise/admin/v1/models')) {
      if (request.method === 'POST') {
        const body = await request.clone().json();
        writes.push({
          body,
          idempotencyKey: request.headers.get('Idempotency-Key'),
          ifMatch: request.headers.get('If-Match'),
          method: request.method,
          pathname
        });
        return json({
          data: {
            ...(body as object), id: 'model-2', providerName: 'OpenAI', status: 'ACTIVE', revision: 0
          },
          requestId: 'req_model_created'
        }, 201);
      }
      return json({
        data: {
          items: [{
            id: 'model-1', providerId: 'provider-1', providerName: 'OpenAI', alias: 'gpt-5.6-sol',
            modelId: 'gpt-5.6-sol', name: 'GPT 5.6 Sol', contextWindow: 1_000_000, maxTokens: 128_000,
            reasoningEfforts: { low: 'low', high: 'high', xhigh: 'xhigh' }, sortOrder: 10,
            status: 'ACTIVE', revision: 1
          }],
          page: { hasMore: false, limit: 100, nextCursor: null }
        },
        requestId: 'req_models'
      });
    }
    if (pathname.endsWith('/enterprise/admin/v1/providers')) {
      return json({
        data: {
          items: [{
            id: 'provider-1', providerKey: 'openai', name: 'OpenAI', providerType: 'CUSTOM',
            apiProtocol: 'openai-responses', baseUrl: 'https://example.invalid', credentialConfigured: true,
            status: 'ACTIVE', connectTimeoutMs: 10_000, readTimeoutMs: 600_000, revision: 1
          }],
          page: { hasMore: false, limit: 100, nextCursor: null }
        },
        requestId: 'req_providers'
      });
    }
    if (pathname.endsWith('/enterprise/admin/v1/model-grants')) {
      if (request.method === 'POST') {
        const body = await request.clone().json();
        writes.push({
          body,
          idempotencyKey: request.headers.get('Idempotency-Key'),
          ifMatch: request.headers.get('If-Match'),
          method: request.method,
          pathname
        });
        return json({
          data: {
            ...(body as object), id: 'grant-2', modelAlias: 'gpt-5.6-sol',
            subjectName: '所有成员', revision: 0
          },
          requestId: 'req_grant_created'
        }, 201);
      }
      return json({
        data: {
          items: [{
            id: 'grant-1', modelId: 'model-1', modelAlias: 'gpt-5.6-sol',
            subjectType: 'ALL_MEMBERS', subjectId: null, subjectName: '所有成员',
            status: 'ACTIVE', revision: 0
          }],
          page: { hasMore: false, limit: 100, nextCursor: null }
        },
        requestId: 'req_grants'
      });
    }
    if (pathname.endsWith('/enterprise/admin/v1/quotas')) {
      return json({
        data: {
          items: [{
            id: 'quota-1', name: '组织默认策略', subjectType: 'ORGANIZATION', subjectId: null,
            subjectName: null, dailyTokenLimit: null, monthlyTokenLimit: null,
            rpm: 60, concurrency: 4, status: 'ACTIVE', revision: 0
          }],
          page: { hasMore: false, limit: 100, nextCursor: null }
        },
        requestId: 'req_quotas'
      });
    }
    if (pathname.endsWith('/enterprise/admin/v1/plugins')) {
      return json({
        data: {
          items: [{
            id: 'plugin-1', packageName: '@enterprise-agent/audit-tools', displayName: 'Audit Tools',
            status: 'ACTIVE', revision: 4,
            versions: [{
              id: 'version-1', packageId: 'plugin-1', packageName: '@enterprise-agent/audit-tools',
              version: '1.1.0', sizeBytes: 12_288, sha256: 'b'.repeat(64), signatureBase64: `${'B'.repeat(86)}==`,
              compatibility: {
                harnessCommits: ['b150a551b8d465e31e418e1b2eaf5e79bbb7d28e'],
                enterpriseBundleRange: '>=0.1.0 <0.2.0', operatingSystems: ['darwin', 'linux']
              },
              status: 'PUBLISHED', createdAt: '2026-08-31T05:00:00Z', revision: 4
            }, {
              id: 'version-2', packageId: 'plugin-1', packageName: '@enterprise-agent/audit-tools',
              version: '1.2.0', sizeBytes: 13_312, sha256: 'a'.repeat(64), signatureBase64: `${'A'.repeat(86)}==`,
              compatibility: {
                harnessCommits: ['b150a551b8d465e31e418e1b2eaf5e79bbb7d28e'],
                enterpriseBundleRange: '>=0.1.0 <0.2.0', operatingSystems: ['darwin', 'linux']
              },
              status: 'VALIDATED', createdAt: '2026-09-01T05:00:00Z', revision: 3
            }],
            assignments: [{
              id: 'assignment-1', packageId: 'plugin-1', pluginVersionId: 'version-1',
              subjectType: 'ALL', subjectId: null, desiredState: 'INSTALLED', required: true,
              status: 'ACTIVE', revision: 0
            }]
          }],
          page: { hasMore: false, limit: 100, nextCursor: null }
        },
        requestId: 'req_plugins'
      });
    }
    if (pathname.endsWith('/enterprise/admin/v1/plugins/versions/version-2/actions/publish')) {
      writes.push({
        body: null,
        idempotencyKey: request.headers.get('Idempotency-Key'),
        ifMatch: request.headers.get('If-Match'),
        method: request.method,
        pathname
      });
      return json({
        data: {
          id: 'version-2', packageId: 'plugin-1', packageName: '@enterprise-agent/audit-tools',
          version: '1.2.0', sizeBytes: 12_288, sha256: 'a'.repeat(64), signatureBase64: `${'A'.repeat(86)}==`,
          compatibility: {
            harnessCommits: ['b150a551b8d465e31e418e1b2eaf5e79bbb7d28e'],
            enterpriseBundleRange: '>=0.1.0 <0.2.0', operatingSystems: ['darwin', 'linux']
          },
          status: 'PUBLISHED', createdAt: '2026-09-01T05:00:00Z', revision: 4
        },
        requestId: 'req_plugin_published'
      });
    }
    if (pathname.endsWith('/enterprise/admin/v1/plugins/plugin-1/assignments/batch')) {
      const body = await request.clone().json();
      writes.push({
        body,
        idempotencyKey: request.headers.get('Idempotency-Key'),
        ifMatch: request.headers.get('If-Match'),
        method: request.method,
        pathname
      });
      return json({ data: [], requestId: 'req_plugin_assignments' });
    }
    if (pathname.endsWith('/enterprise/admin/v1/plugins/inventory')) {
      return json({
        data: {
          items: [{
            deviceId: 'device-1', username: 'candidate', packageName: '@enterprise-agent/audit-tools',
            version: '1.1.0', sha256: 'b'.repeat(64), desiredRevision: 7,
            state: 'RESTART_REQUIRED', loaderPhase: 'loaded', lastErrorCode: null,
            observedAt: '2026-09-01T05:30:00Z'
          }],
          page: { hasMore: false, limit: 100, nextCursor: null }
        },
        requestId: 'req_plugin_inventory'
      });
    }
    if (pathname.endsWith('/enterprise/auth/v1/logout')) {
      return logoutStatus === 200
        ? json({ data: { loggedOut: true }, requestId: 'req_logout' })
        : json({ code: 'ENT_PLATFORM_UNAVAILABLE', message: 'unavailable' }, logoutStatus);
    }
    throw new Error(`unexpected request ${request.url}`);
  }));
  return writes;
}

function renderRoute(path: string, role?: AuthBuiltInRole, logoutStatus = 200, permissions: string[] = []) {
  let writes: CapturedWrite[] = [];
  if (role) {
    setToken('test-token');
    writes = mockApi(role, logoutStatus, permissions);
  }
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return writes;
}

describe('product console access', () => {
  it('uses the fixed five-role page matrix', () => {
    const paths = (role: AuthBuiltInRole) => productRoutesFor([role]).map((route) => route.to);
    expect(paths('enterprise_admin')).toEqual(['/', '/access', '/plugins', '/members', '/activity', '/settings']);
    expect(paths('model_admin')).toEqual(['/', '/access', '/activity']);
    expect(paths('plugin_admin')).toEqual(['/plugins', '/activity']);
    expect(paths('auditor')).toEqual(['/activity']);
    expect(paths('employee')).toEqual([]);
    expect(productRoutesFor(['model_admin', 'plugin_admin']).map((route) => route.to))
      .toEqual(['/', '/access', '/plugins', '/activity']);
  });

  it('sends an unauthenticated product URL to login', async () => {
    renderRoute('/members');
    expect(await screen.findByRole('heading', { name: '登录管理控制台' })).toBeTruthy();
  });

  it('sends an employee to the fixed forbidden page', async () => {
    renderRoute('/', 'employee');
    expect(await screen.findByRole('heading', { name: '无控制台访问权限' })).toBeTruthy();
  });

  it('redirects a direct unauthorized URL to the first accessible page', async () => {
    renderRoute('/plugins', 'model_admin');
    expect(await screen.findByRole('heading', { name: '模型' }, { timeout: 5_000 })).toBeTruthy();
  });

  it('renders the product member directory and continues with the Server cursor', async () => {
    renderRoute('/members', 'enterprise_admin');
    expect(await screen.findByText('Developer One')).toBeTruthy();
    expect(screen.queryByText('Developer Two')).toBeNull();
    const firstMember = screen.getByRole('row', { name: /Developer One/ });
    expect(within(firstMember).getByText('成员')).toBeTruthy();
    expect(within(firstMember).getByText('未绑定')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    expect(await screen.findByText('Developer Two')).toBeTruthy();
  });

  it('opens member detail and replaces fixed roles with CAS', async () => {
    const writes = renderRoute('/members', 'enterprise_admin', 200, ['ent:member:write']);
    expect(await screen.findByText('Developer One')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '查看 Developer One' }));

    const dialog = await screen.findByRole('dialog', { name: 'Developer One' });
    expect(within(dialog).getByText('Developer Mac')).toBeTruthy();
    fireEvent.click(within(dialog).getByLabelText('模型管理员'));
    fireEvent.click(within(dialog).getByRole('button', { name: '保存角色' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      body: { roles: ['employee', 'model_admin'] },
      ifMatch: '1',
      method: 'PUT',
      pathname: '/enterprise/admin/v1/members/202/roles'
    });
  });

  it('unlinks an external member identity with member revision CAS', async () => {
    const writes = renderRoute('/members', 'enterprise_admin', 200, ['ent:member:write']);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(await screen.findByText('Developer One')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '查看 Developer One' }));

    const dialog = await screen.findByRole('dialog', { name: 'Developer One' });
    expect(await within(dialog).findByRole('option', { name: 'Microsoft Entra (OIDC)' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '解除 Corporate LDAP' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      body: null,
      ifMatch: '1',
      method: 'DELETE',
      pathname: '/enterprise/admin/v1/members/202/identities/1919100000000000291'
    });
  });

  it('renders real managed models and switches to providers', async () => {
    renderRoute('/', 'enterprise_admin');
    expect(await screen.findByText('GPT 5.6 Sol')).toBeTruthy();
    expect(screen.getByText('1M')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /上游模型 ID/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '模型提供商' }));
    expect(await screen.findByText('OpenAI')).toBeTruthy();
  });

  it('switches the global Beautiful UI theme', async () => {
    renderRoute('/', 'enterprise_admin');
    expect(await screen.findByRole('heading', { name: '模型' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Light mode' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('bui-theme')).toBe('light');

    fireEvent.click(screen.getByRole('button', { name: 'Dark mode' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('bui-theme')).toBe('dark');
  });

  it('creates a managed model with decimal capacity and an idempotency key', async () => {
    const writes = renderRoute('/', 'enterprise_admin', 200, ['ent:model:write']);
    const createButton = await screen.findByRole('button', { name: '新建模型' });
    await waitFor(() => expect((createButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(createButton);

    const dialog = screen.getByRole('dialog', { name: '新建受管模型' });
    fireEvent.change(within(dialog).getByLabelText('上游模型 ID'), { target: { value: 'gpt-5.6-mini' } });
    fireEvent.change(within(dialog).getByLabelText('模型 ID'), { target: { value: 'gpt-5.6-mini' } });
    fireEvent.click(within(dialog).getByText('容量与推理'));
    fireEvent.change(within(dialog).getByLabelText('上下文窗口'), { target: { value: '256K' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      body: {
        alias: 'gpt-5.6-mini',
        contextWindow: 256_000,
        modelId: 'gpt-5.6-mini',
        providerId: 'provider-1',
        sortOrder: 100
      },
      method: 'POST',
      pathname: '/enterprise/admin/v1/models'
    });
    expect(writes[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('renders model access, token limits and rate limits from Server facts', async () => {
    renderRoute('/access', 'model_admin');
    expect(await screen.findByText('gpt-5.6-sol')).toBeTruthy();
    expect(screen.getByText('所有成员')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: '使用限额' }));
    expect(await screen.findByText('组织默认策略')).toBeTruthy();
    expect(screen.getAllByText('无限制')).toHaveLength(2);

    fireEvent.click(screen.getByRole('tab', { name: '速率限制' }));
    expect(await screen.findByText('60')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('creates an all-members grant with a null subject and idempotency key', async () => {
    const writes = renderRoute('/access', 'model_admin', 200, ['ent:grant:write']);
    expect(await screen.findByText('gpt-5.6-sol')).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: '新建授权' }));
    const dialog = screen.getByRole('dialog', { name: '新建模型授权' });
    fireEvent.change(within(dialog).getByLabelText('模型'), { target: { value: 'model-1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      body: {
        modelId: 'model-1',
        status: 'ACTIVE',
        subjectId: null,
        subjectType: 'ALL_MEMBERS'
      },
      method: 'POST',
      pathname: '/enterprise/admin/v1/model-grants'
    });
    expect(writes[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('selects a member from the complete cursor directory for model access', async () => {
    const writes = renderRoute('/access', 'model_admin', 200, ['ent:grant:write']);
    expect(await screen.findByText('gpt-5.6-sol')).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: '新建授权' }));
    const dialog = screen.getByRole('dialog', { name: '新建模型授权' });
    fireEvent.change(within(dialog).getByLabelText('模型'), { target: { value: 'model-1' } });
    fireEvent.change(within(dialog).getByLabelText('授权对象'), { target: { value: 'MEMBER' } });
    const member = await within(dialog).findByLabelText('成员');
    await within(dialog).findByRole('option', { name: 'Developer Two (developer.two)' });
    fireEvent.change(member, { target: { value: '303' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      body: { modelId: 'model-1', status: 'ACTIVE', subjectId: '303', subjectType: 'MEMBER' },
      pathname: '/enterprise/admin/v1/model-grants'
    });
  });

  it('renders plugin facts and publishes a validated version with CAS', async () => {
    const writes = renderRoute('/plugins', 'enterprise_admin', 200, ['ent:plugin:write']);
    expect(await screen.findAllByText('Audit Tools')).toHaveLength(2);
    expect(screen.getByText('1.2.0')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '发布 @enterprise-agent/audit-tools@1.2.0' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      ifMatch: '3',
      method: 'POST',
      pathname: '/enterprise/admin/v1/plugins/versions/version-2/actions/publish'
    });

    fireEvent.click(screen.getByRole('tab', { name: '分配策略' }));
    expect(await screen.findByText('所有成员')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '设备状态' }));
    expect(await screen.findByText('candidate')).toBeTruthy();
    expect(screen.getAllByText('需要重启')).toHaveLength(2);
  });

  it('replaces plugin assignments with a selected member, CAS and idempotency', async () => {
    const writes = renderRoute('/plugins', 'plugin_admin', 200, ['ent:plugin:write']);
    expect(await screen.findAllByText('Audit Tools')).toHaveLength(2);
    fireEvent.click(screen.getByRole('tab', { name: '分配策略' }));
    expect(await screen.findByText('所有成员')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '配置分配' }));

    const dialog = screen.getByRole('dialog', { name: '配置插件分配' });
    fireEvent.click(within(dialog).getByRole('button', { name: '添加分配' }));
    const member = await within(dialog).findByLabelText('成员');
    await within(dialog).findByRole('option', { name: 'Developer Two (developer.two)' });
    fireEvent.change(member, { target: { value: '303' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存分配' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      body: { items: [
        { pluginVersionId: 'version-1', subjectType: 'ALL', subjectId: null, desiredState: 'INSTALLED', required: true },
        { pluginVersionId: 'version-1', subjectType: 'USER', subjectId: '303', desiredState: 'INSTALLED', required: false }
      ] },
      ifMatch: '4',
      method: 'POST',
      pathname: '/enterprise/admin/v1/plugins/plugin-1/assignments/batch'
    });
    expect(writes[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('product console session', () => {
  it('keeps Sign out last and clears the token only after Server logout succeeds', async () => {
    renderRoute('/', 'enterprise_admin');
    expect(await screen.findByRole('heading', { name: '模型' })).toBeTruthy();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Agent Platform' }))[0]!);
    const menu = document.querySelector('[data-workspace-menu]')!;
    const buttons = menu.querySelectorAll('button');
    expect(buttons.item(buttons.length - 1).textContent).toContain('Sign out');

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: '登录管理控制台' })).toBeTruthy();
    expect(getToken()).toBeNull();
  });

  it('keeps the token when Server logout fails', async () => {
    renderRoute('/', 'enterprise_admin', 500);
    expect(await screen.findByRole('heading', { name: '模型' })).toBeTruthy();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Agent Platform' }))[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect((await screen.findByRole('alert')).textContent).toContain('会话仍然有效');
    expect(getToken()).toBe('test-token');
  });

  it('consumes an invalid PKCE transaction once', async () => {
    sessionStorage.setItem('enterprise-admin-pkce', JSON.stringify({
      state: 'expected', verifier: 'verifier', redirectUri: 'http://localhost/enterprise/auth/callback', returnTo: '/'
    }));
    await expect(completeEnterpriseAdminLogin('?code=code&state=wrong')).rejects.toThrow('ENT_AUTH_CODE_INVALID');
    await expect(completeEnterpriseAdminLogin('?code=code&state=expected')).rejects.toThrow('ENT_AUTH_CODE_INVALID');
    await waitFor(() => expect(sessionStorage.getItem('enterprise-admin-pkce')).toBeNull());
  });
});
