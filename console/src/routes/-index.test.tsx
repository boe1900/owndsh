/**
 * [INPUT]: 依赖 Testing Library、Vitest、内存 history、静态角色元数据与完整产品 routeTree。
 * [OUTPUT]: 验证五角色矩阵、第一方多身份登录/主题、LOCAL 建号/独立用户中心、LDAP、模型/访问策略/插件写入和 Sign out。
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
import { clearSessionCache } from '@/auth/session';
import { routeTree } from '../routeTree.gen';

window.scrollTo = () => undefined;
client.setConfig({ baseUrl: 'http://localhost' });

afterEach(() => {
  cleanup();
  clearSessionCache();
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
          member: {
            id: '101', username: 'candidate.admin', displayName: 'Candidate Admin',
            email: 'candidate.admin@example.org', avatarUrl: null,
            loginMethods: [
              { sourceName: '本地', sourceType: 'LOCAL' },
              { sourceName: 'Corporate LDAP', sourceType: 'LDAP' }
            ]
          },
          roles: [role],
          permissions,
          deployment: { name: 'OwnDsh' }
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
            ...memberDetail(),
            member: {
              ...memberDetail().member,
              id: '405', username: 'local.user', displayName: 'Local User', revision: 0
            }
          },
          requestId: 'req_local_member_created'
        }, 201);
      }
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
    if (pathname.endsWith('/enterprise/admin/v1/identity-sources/1919100000000000191/ldap/users/actions/import')) {
      writes.push({
        body: await request.clone().json(),
        idempotencyKey: request.headers.get('Idempotency-Key'),
        ifMatch: request.headers.get('If-Match'),
        method: request.method,
        pathname
      });
      return json({ data: { userId: '404', created: true }, requestId: 'req_ldap_import' });
    }
    if (pathname.endsWith('/enterprise/admin/v1/identity-sources/1919100000000000191/ldap/users')) {
      return json({
        data: { items: [{
          dn: 'uid=alice,ou=people,dc=example,dc=org', externalSubject: 'entry-alice',
          username: 'alice', displayName: 'Alice LDAP', email: 'alice@example.org'
        }] },
        requestId: 'req_ldap_users'
      });
    }
    if (pathname.endsWith('/enterprise/admin/v1/identity-sources/1919100000000000191/ldap/groups')) {
      return json({
        data: { items: [{
          externalGroup: 'cn=engineering,ou=groups,dc=example,dc=org', displayName: 'engineering'
        }] },
        requestId: 'req_ldap_groups'
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
    if (pathname.endsWith('/enterprise/admin/v1/access-groups/group-1')) {
      writes.push({
        body: request.method === 'PUT' ? await request.clone().json() : null,
        idempotencyKey: request.headers.get('Idempotency-Key'),
        ifMatch: request.headers.get('If-Match'),
        method: request.method,
        pathname
      });
      return request.method === 'DELETE'
        ? json({ data: { id: 'group-1', deleted: true }, requestId: 'req_access_group_deleted' })
        : json({
            data: {
              id: 'group-1', name: '平台组', manualMemberIds: ['202'], memberCount: 1, revision: 2
            },
            requestId: 'req_access_group_updated'
          });
    }
    if (pathname.endsWith('/enterprise/admin/v1/access-groups')) {
      if (request.method === 'POST') {
        const body = await request.clone().json() as { name: string; memberIds: string[] };
        writes.push({
          body,
          idempotencyKey: request.headers.get('Idempotency-Key'),
          ifMatch: request.headers.get('If-Match'),
          method: request.method,
          pathname
        });
        return json({
          data: {
            id: 'group-2', name: body.name, manualMemberIds: body.memberIds,
            memberCount: body.memberIds.length, revision: 0
          },
          requestId: 'req_access_group_created'
        }, 201);
      }
      return json({
        data: {
          items: [{
            id: 'group-1', name: '研发组', manualMemberIds: ['202'], memberCount: 2, revision: 1
          }],
          page: { hasMore: false, limit: 100, nextCursor: null }
        },
        requestId: 'req_access_groups'
      });
    }
    if (pathname.endsWith('/enterprise/admin/v1/group-mappings')) {
      if (request.method === 'POST') {
        const body = await request.clone().json();
        writes.push({
          body,
          idempotencyKey: request.headers.get('Idempotency-Key'),
          ifMatch: request.headers.get('If-Match'),
          method: request.method,
          pathname
        });
        return json({ data: { id: 'mapping-1', ...(body as object), revision: 0 }, requestId: 'req_mapping' }, 201);
      }
      return json({
        data: { items: [], page: { hasMore: false, limit: 100, nextCursor: null } },
        requestId: 'req_group_mappings'
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
            ...(body as object), id: 'provider-2', credentialConfigured: true,
            status: 'ACTIVE', revision: 0
          },
          requestId: 'req_provider_created'
        }, 201);
      }
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
    if (pathname.endsWith('/enterprise/admin/v1/providers/provider-1')) {
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
          ...(body as object), id: 'provider-1', providerType: 'CUSTOM', apiProtocol: 'openai-responses',
          credentialConfigured: true, status: 'ACTIVE', revision: 2
        },
        requestId: 'req_provider_updated'
      });
    }
    if (pathname.endsWith('/enterprise/admin/v1/model-sets/set-1')) {
      writes.push({
        body: request.method === 'PUT' ? await request.clone().json() : null,
        idempotencyKey: request.headers.get('Idempotency-Key'),
        ifMatch: request.headers.get('If-Match'),
        method: request.method,
        pathname
      });
      return request.method === 'DELETE'
        ? json({ data: { id: 'set-1', deleted: true }, requestId: 'req_model_set_deleted' })
        : json({
            data: {
              id: 'set-1', name: '旗舰模型', modelIds: ['model-1'], modelCount: 1, revision: 2
            },
            requestId: 'req_model_set_updated'
          });
    }
    if (pathname.endsWith('/enterprise/admin/v1/model-sets')) {
      if (request.method === 'POST') {
        const body = await request.clone().json() as { name: string; modelIds: string[] };
        writes.push({
          body,
          idempotencyKey: request.headers.get('Idempotency-Key'),
          ifMatch: request.headers.get('If-Match'),
          method: request.method,
          pathname
        });
        return json({
          data: {
            id: 'set-2', name: body.name, modelIds: body.modelIds,
            modelCount: body.modelIds.length, revision: 0
          },
          requestId: 'req_model_set_created'
        }, 201);
      }
      return json({
        data: {
          items: [{
            id: 'set-1', name: '编码模型', modelIds: ['model-1'], modelCount: 1, revision: 1
          }],
          page: { hasMore: false, limit: 100, nextCursor: null }
        },
        requestId: 'req_model_sets'
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
            ...(body as object), id: 'grant-2', resourceName: '编码模型',
            subjectName: '所有成员', revision: 0
          },
          requestId: 'req_grant_created'
        }, 201);
      }
      return json({
        data: {
          items: [{
            id: 'grant-1', resourceType: 'MODEL', resourceId: 'model-1', resourceName: 'gpt-5.6-sol',
            subjectType: 'ALL_MEMBERS', subjectId: null, subjectName: '所有成员',
            status: 'ACTIVE', revision: 0
          }],
          page: { hasMore: false, limit: 100, nextCursor: null }
        },
        requestId: 'req_grants'
      });
    }
    if (pathname.endsWith('/enterprise/admin/v1/quotas/quota-1/windows')) {
      return json({
        data: [{
          policyId: 'quota-1', windowType: 'FIVE_HOURS',
          windowStart: '2026-09-02T10:00:00Z', resetsAt: '2026-09-02T15:00:00Z',
          limit: 100_000, usedTokens: 25_000, reservedTokens: 0
        }],
        requestId: 'req_quota_windows'
      });
    }
    if (pathname.endsWith('/enterprise/admin/v1/quotas/quota-provider-1')) {
      const body = request.method === 'PUT' ? await request.clone().json() : null;
      writes.push({
        body,
        idempotencyKey: request.headers.get('Idempotency-Key'),
        ifMatch: request.headers.get('If-Match'),
        method: request.method,
        pathname
      });
      return request.method === 'DELETE'
        ? json({ data: { id: 'quota-provider-1', deleted: true }, requestId: 'req_provider_capacity_deleted' })
        : json({
            data: {
              ...(body as object), id: 'quota-provider-1', subjectName: null,
              resourceName: 'OpenAI', revision: 4
            },
            requestId: 'req_provider_capacity_updated'
          });
    }
    if (pathname.endsWith('/enterprise/admin/v1/quotas')) {
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
            ...(body as object), id: 'quota-2', subjectName: null,
            resourceName: '编码模型', revision: 0
          },
          requestId: 'req_quota_created'
        }, 201);
      }
      return json({
        data: {
          items: [{
            id: 'quota-1', name: '组织默认策略', subjectType: 'ORGANIZATION', subjectId: null,
            policyType: 'TOKEN',
            subjectName: null, resourceType: 'ALL_MODELS', resourceId: null, resourceName: '全部模型',
            fiveHourTokenLimit: 100_000, dailyTokenLimit: null, weeklyTokenLimit: null, monthlyTokenLimit: null,
            rpm: null, concurrency: null, status: 'ACTIVE', revision: 0
          }, {
            id: 'quota-rate-1', name: '组织速率限制', policyType: 'RATE',
            subjectType: 'ORGANIZATION', subjectId: null, subjectName: null,
            resourceType: 'ALL_MODELS', resourceId: null, resourceName: '全部模型',
            fiveHourTokenLimit: null, dailyTokenLimit: null, weeklyTokenLimit: null, monthlyTokenLimit: null,
            rpm: 60, concurrency: 4, status: 'ACTIVE', revision: 0
          }, {
            id: 'quota-provider-1', name: 'OpenAI 供应商容量', policyType: 'RATE',
            subjectType: 'ORGANIZATION', subjectId: null, subjectName: null,
            resourceType: 'PROVIDER', resourceId: 'provider-1', resourceName: 'OpenAI',
            fiveHourTokenLimit: null, dailyTokenLimit: null, weeklyTokenLimit: null, monthlyTokenLimit: null,
            rpm: 120, concurrency: 8, status: 'ACTIVE', revision: 3
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
            id: 'plugin-1', packageName: '@owndsh/audit-tools', displayName: 'Audit Tools',
            status: 'ACTIVE', revision: 4,
            versions: [{
              id: 'version-1', packageId: 'plugin-1', packageName: '@owndsh/audit-tools',
              version: '1.1.0', sizeBytes: 12_288, sha256: 'b'.repeat(64), signatureBase64: `${'B'.repeat(86)}==`,
              compatibility: {
                harnessCommits: ['b150a551b8d465e31e418e1b2eaf5e79bbb7d28e'],
                enterpriseBundleRange: '>=0.1.0 <0.2.0', operatingSystems: ['darwin', 'linux']
              },
              status: 'PUBLISHED', createdAt: '2026-08-31T05:00:00Z', revision: 4
            }, {
              id: 'version-2', packageId: 'plugin-1', packageName: '@owndsh/audit-tools',
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
          id: 'version-2', packageId: 'plugin-1', packageName: '@owndsh/audit-tools',
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
            deviceId: 'device-1', username: 'candidate', packageName: '@owndsh/audit-tools',
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
    if (pathname.endsWith('/enterprise/admin/v1/account/password')) {
      const body = await request.clone().json() as { currentPassword: string; newPassword: string };
      writes.push({
        body,
        idempotencyKey: request.headers.get('Idempotency-Key'),
        ifMatch: request.headers.get('If-Match'),
        method: request.method,
        pathname
      });
      if (body.currentPassword === 'WrongCurrent!42') {
        return json({
          error: {
            code: 'ENT_INVALID_REQUEST', message: '当前密码不正确',
            requestId: 'req_password_rejected', retryable: false, details: null
          }
        }, 400);
      }
      return json({ data: { changed: true }, requestId: 'req_password_changed' });
    }
    throw new Error(`unexpected request ${request.url}`);
  }));
  return writes;
}

function renderRoute(path: string, role?: AuthBuiltInRole, logoutStatus = 200, permissions: string[] = []) {
  let writes: CapturedWrite[] = [];
  if (role) {
    writes = mockApi(role, logoutStatus, permissions);
  } else {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      error: { code: 'ENT_AUTH_REQUIRED', message: '需要登录', requestId: 'req_auth', retryable: false, details: null }
    }, 401)));
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
    expect(paths('enterprise_admin')).toEqual(['/', '/access', '/plugins', '/members', '/activity']);
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
    expect(screen.getByRole('heading', { name: 'OwnDsh · Truly Own Your DeepSeek-Harness.' })).toBeTruthy();
    expect(document.querySelectorAll('img[src="/owndsh-whale-mono-m2-animated.png"]')).toHaveLength(3);
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

  it('creates a LOCAL member with an idempotency key and first-login password rotation', async () => {
    const writes = renderRoute('/members', 'enterprise_admin', 200, ['ent:member:write']);
    expect(await screen.findByText('Developer One')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '新建本地成员' }));

    const dialog = screen.getByRole('dialog', { name: '新建本地成员' });
    fireEvent.change(within(dialog).getByLabelText('用户名'), { target: { value: 'local.user' } });
    fireEvent.change(within(dialog).getByLabelText('显示名称'), { target: { value: 'Local User' } });
    fireEvent.change(within(dialog).getByLabelText('邮箱（可选）'), { target: { value: 'local.user@example.org' } });
    fireEvent.change(within(dialog).getByLabelText('初始密码'), { target: { value: 'InitialReady!42' } });
    fireEvent.change(within(dialog).getByLabelText('确认初始密码'), { target: { value: 'InitialReady!42' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '创建' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      body: {
        username: 'local.user', displayName: 'Local User', email: 'local.user@example.org',
        initialPassword: 'InitialReady!42'
      },
      method: 'POST',
      pathname: '/enterprise/admin/v1/members'
    });
    expect(writes[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText('本地成员已创建，首次登录需设置新密码')).toBeTruthy();
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

  it('creates, updates and deletes a flat access group with write guards', async () => {
    const writes = renderRoute('/members', 'enterprise_admin', 200, ['ent:member:write']);
    expect(await screen.findByText('Developer One')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '用户组' }));
    expect(await screen.findByText('研发组')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '新建用户组' }));
    let dialog = screen.getByRole('dialog', { name: '新建用户组' });
    fireEvent.change(within(dialog).getByLabelText('用户组名称'), { target: { value: '平台组' } });
    const memberSelect = within(dialog).getByLabelText('手工成员') as HTMLSelectElement;
    (await within(memberSelect).findByRole('option', { name: 'Developer One (developer.one)' }) as HTMLOptionElement).selected = true;
    fireEvent.change(memberSelect);
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      body: { name: '平台组', memberIds: ['202'] },
      method: 'POST',
      pathname: '/enterprise/admin/v1/access-groups'
    });
    expect(writes[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);

    fireEvent.click(await screen.findByRole('button', { name: '编辑 研发组' }));
    dialog = screen.getByRole('dialog', { name: '编辑用户组' });
    fireEvent.change(within(dialog).getByLabelText('用户组名称'), { target: { value: '平台组' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toMatchObject({ ifMatch: '1', method: 'PUT', pathname: '/enterprise/admin/v1/access-groups/group-1' });

    fireEvent.click(await screen.findByRole('button', { name: '删除 研发组' }));
    dialog = screen.getByRole('dialog', { name: '确认删除' });
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }));
    await waitFor(() => expect(writes).toHaveLength(3));
    expect(writes[2]).toMatchObject({ ifMatch: '1', method: 'DELETE', pathname: '/enterprise/admin/v1/access-groups/group-1' });
  });

  it('imports one LDAP member and maps one directory group', async () => {
    const writes = renderRoute('/members', 'enterprise_admin', 200, [
      'ent:member:write', 'ent:identity:read', 'ent:identity:write'
    ]);
    expect(await screen.findByText('Developer One')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '从 LDAP 导入' }));
    let dialog = await screen.findByRole('dialog', { name: '从 LDAP 导入成员' });
    fireEvent.change(within(dialog).getByLabelText('LDAP 用户关键字'), { target: { value: 'alice' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '搜索' }));
    expect(await within(dialog).findByText(/Alice LDAP/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '导入' }));
    expect(await screen.findByText('LDAP 成员已导入')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: '身份接入' }));
    fireEvent.click(await screen.findByRole('button', { name: 'LDAP 组映射 Corporate LDAP' }));
    const mappingDialog = screen.getByRole('dialog', { name: 'LDAP 组映射 · Corporate LDAP' });
    const createMapping = within(mappingDialog).getByRole('button', { name: '新建映射' });
    await waitFor(() => expect(createMapping).toHaveProperty('disabled', false));
    fireEvent.click(createMapping);
    dialog = screen.getByRole('dialog', { name: '映射 LDAP 组 · Corporate LDAP' });
    fireEvent.change(within(dialog).getByLabelText('LDAP 组关键字'), { target: { value: 'engineering' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '搜索' }));
    fireEvent.click(await within(dialog).findByRole('radio', { name: /engineering/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: '保存映射' }));

    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[0]).toMatchObject({
      body: { dn: 'uid=alice,ou=people,dc=example,dc=org' },
      method: 'POST',
      pathname: '/enterprise/admin/v1/identity-sources/1919100000000000191/ldap/users/actions/import'
    });
    expect(writes[1]).toMatchObject({
      body: {
        sourceId: '1919100000000000191',
        externalGroup: 'cn=engineering,ou=groups,dc=example,dc=org',
        accessGroupId: 'group-1'
      },
      method: 'POST',
      pathname: '/enterprise/admin/v1/group-mappings'
    });
  });

  it('renders real managed models and switches to providers', async () => {
    renderRoute('/', 'enterprise_admin', 200, ['ent:grant:read']);
    expect(await screen.findByText('GPT 5.6 Sol')).toBeTruthy();
    expect(screen.getByText('1M')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /上游模型 ID/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '模型提供商' }));
    expect(await screen.findByText('OpenAI')).toBeTruthy();
    expect(await screen.findByText('120 RPM / 8 并发')).toBeTruthy();
  });

  it('edits provider configuration and shared upstream capacity together', async () => {
    const writes = renderRoute('/', 'enterprise_admin', 200, ['ent:model:write', 'ent:grant:read', 'ent:grant:write']);
    expect(await screen.findByText('GPT 5.6 Sol')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '模型提供商' }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑 OpenAI' }));

    const dialog = screen.getByRole('dialog', { name: '编辑模型提供商' });
    expect(within(dialog).getByText('该提供商下所有模型共享此上限；均未启用表示不限制。')).toBeTruthy();
    fireEvent.change(within(dialog).getByRole('textbox', { name: '最大并发' }), { target: { value: '10' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[0]).toMatchObject({ ifMatch: '1', method: 'PUT', pathname: '/enterprise/admin/v1/providers/provider-1' });
    expect(writes[1]).toMatchObject({
      body: {
        policyType: 'RATE', subjectType: 'ORGANIZATION', resourceType: 'PROVIDER',
        resourceId: 'provider-1', rpm: 120, concurrency: 10
      },
      ifMatch: '3',
      method: 'PUT',
      pathname: '/enterprise/admin/v1/quotas/quota-provider-1'
    });
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

  it('creates, updates and deletes a flat model set with write guards', async () => {
    const writes = renderRoute('/', 'enterprise_admin', 200, ['ent:model:write']);
    expect(await screen.findByText('GPT 5.6 Sol')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '模型集' }));
    expect(await screen.findByText('编码模型')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '新建模型集' }));
    let dialog = screen.getByRole('dialog', { name: '新建模型集' });
    fireEvent.change(within(dialog).getByLabelText('模型集名称'), { target: { value: '旗舰模型' } });
    const modelSelect = within(dialog).getByLabelText('模型') as HTMLSelectElement;
    (within(modelSelect).getByRole('option', { name: 'OpenAI / gpt-5.6-sol' }) as HTMLOptionElement).selected = true;
    fireEvent.change(modelSelect);
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      body: { name: '旗舰模型', modelIds: ['model-1'] },
      method: 'POST',
      pathname: '/enterprise/admin/v1/model-sets'
    });
    expect(writes[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);

    fireEvent.click(await screen.findByRole('button', { name: '编辑 编码模型' }));
    dialog = screen.getByRole('dialog', { name: '编辑模型集' });
    fireEvent.change(within(dialog).getByLabelText('模型集名称'), { target: { value: '旗舰模型' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toMatchObject({ ifMatch: '1', method: 'PUT', pathname: '/enterprise/admin/v1/model-sets/set-1' });

    fireEvent.click(await screen.findByRole('button', { name: '删除 编码模型' }));
    dialog = screen.getByRole('dialog', { name: '确认删除' });
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }));
    await waitFor(() => expect(writes).toHaveLength(3));
    expect(writes[2]).toMatchObject({ ifMatch: '1', method: 'DELETE', pathname: '/enterprise/admin/v1/model-sets/set-1' });
  });

  it('renders model access, token limits and rate limits from Server facts', async () => {
    renderRoute('/access', 'model_admin');
    expect(await screen.findByText('gpt-5.6-sol')).toBeTruthy();
    expect(screen.getByText('所有成员')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Token 配额' }));
    expect(await screen.findByText('组织默认策略')).toBeTruthy();
    expect(screen.getByText('5 小时 100,000')).toBeTruthy();
    expect(screen.getByText('每日 无限制')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: '速率限制' }));
    expect(await screen.findByText('60')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('creates an all-members grant with a null subject and idempotency key', async () => {
    const writes = renderRoute('/access', 'model_admin', 200, ['ent:grant:write']);
    expect(await screen.findByText('gpt-5.6-sol')).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: '新建授权' }));
    const dialog = screen.getByRole('dialog', { name: '新建模型授权' });
    fireEvent.change(within(dialog).getByLabelText('资源'), { target: { value: 'set-1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      body: {
        resourceId: 'set-1',
        resourceType: 'MODEL_SET',
        status: 'ACTIVE',
        subjectId: null,
        subjectType: 'ALL_MEMBERS'
      },
      method: 'POST',
      pathname: '/enterprise/admin/v1/model-grants'
    });
    expect(writes[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('grants one access group a complete model set', async () => {
    const writes = renderRoute('/access', 'model_admin', 200, ['ent:grant:write']);
    expect(await screen.findByText('gpt-5.6-sol')).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: '新建授权' }));
    const dialog = screen.getByRole('dialog', { name: '新建模型授权' });
    fireEvent.change(within(dialog).getByLabelText('资源'), { target: { value: 'set-1' } });
    fireEvent.change(within(dialog).getByLabelText('授权对象'), { target: { value: 'ACCESS_GROUP' } });
    fireEvent.change(within(dialog).getByLabelText('用户组'), { target: { value: 'group-1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      body: {
        resourceId: 'set-1', resourceType: 'MODEL_SET', status: 'ACTIVE',
        subjectId: 'group-1', subjectType: 'ACCESS_GROUP'
      },
      pathname: '/enterprise/admin/v1/model-grants'
    });
  });

  it('creates all four token windows for one model set and reads current usage', async () => {
    const writes = renderRoute('/access', 'model_admin', 200, ['ent:grant:write']);
    expect(await screen.findByText('gpt-5.6-sol')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Token 配额' }));
    expect(await screen.findByText('组织默认策略')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '新建 Token 配额' }));
    let dialog = screen.getByRole('dialog', { name: '新建 Token 配额' });
    expect(within(dialog).queryByText('每分钟请求（RPM）')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('策略名称'), { target: { value: '编码额度' } });
    fireEvent.change(within(dialog).getByLabelText('适用对象'), { target: { value: 'ORGANIZATION' } });
    fireEvent.change(within(dialog).getByLabelText('资源范围'), { target: { value: 'MODEL_SET' } });
    fireEvent.change(within(dialog).getByLabelText('模型集'), { target: { value: 'set-1' } });
    for (const [label, value] of [['5 小时', '100000'], ['每日', '300000'], ['每周', '1000000'], ['每月', '3000000']] as const) {
      fireEvent.click(within(dialog).getByRole('checkbox', { name: label }));
      fireEvent.change(within(dialog).getByRole('spinbutton', { name: `${label} Token 额度` }), { target: { value } });
    }
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      body: {
        name: '编码额度', policyType: 'TOKEN', subjectType: 'ORGANIZATION', subjectId: null,
        resourceType: 'MODEL_SET', resourceId: 'set-1',
        fiveHourTokenLimit: 100_000, dailyTokenLimit: 300_000,
        weeklyTokenLimit: 1_000_000, monthlyTokenLimit: 3_000_000,
        rpm: null, concurrency: null
      },
      method: 'POST',
      pathname: '/enterprise/admin/v1/quotas'
    });
    expect(writes[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);

    fireEvent.click(await screen.findByRole('button', { name: '编辑配额策略' }));
    dialog = screen.getByRole('dialog', { name: '编辑 Token 配额' });
    expect(await within(dialog).findByText('25,000 / 100,000')).toBeTruthy();
  });

  it('creates a member rate limit without token windows', async () => {
    const writes = renderRoute('/access', 'model_admin', 200, ['ent:grant:write']);
    expect(await screen.findByText('gpt-5.6-sol')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '速率限制' }));
    expect(await screen.findByText('组织速率限制')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '新建速率限制' }));
    const dialog = screen.getByRole('dialog', { name: '新建速率限制' });
    fireEvent.change(within(dialog).getByLabelText('策略名称'), { target: { value: '架构师限流' } });
    const member = within(dialog).getByLabelText('成员');
    await within(dialog).findByRole('option', { name: 'Developer Two (developer.two)' });
    fireEvent.change(member, { target: { value: '303' } });
    expect(within(dialog).queryByText('Token 额度')).toBeNull();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '每分钟请求（RPM）' }));
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: '每分钟请求（RPM）' }), { target: { value: '60' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '并发请求' }));
    fireEvent.change(within(dialog).getByRole('spinbutton', { name: '并发请求' }), { target: { value: '3' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      body: {
        name: '架构师限流', policyType: 'RATE', subjectType: 'MEMBER',
        subjectId: '303',
        resourceType: 'ALL_MODELS', fiveHourTokenLimit: null, dailyTokenLimit: null,
        weeklyTokenLimit: null, monthlyTokenLimit: null, rpm: 60, concurrency: 3
      },
      method: 'POST',
      pathname: '/enterprise/admin/v1/quotas'
    });
  });

  it('keeps provider capacity out of the consumer rate form', async () => {
    const writes = renderRoute('/access', 'model_admin', 200, ['ent:grant:write']);
    expect(await screen.findByText('gpt-5.6-sol')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '速率限制' }));
    expect(await screen.findByText('组织速率限制')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '新建速率限制' }));
    const dialog = screen.getByRole('dialog', { name: '新建速率限制' });
    expect(within(dialog).queryByRole('option', { name: '模型供应商' })).toBeNull();
    expect(screen.queryByText('OpenAI 供应商容量')).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it('selects a member from the complete cursor directory for model access', async () => {
    const writes = renderRoute('/access', 'model_admin', 200, ['ent:grant:write']);
    expect(await screen.findByText('gpt-5.6-sol')).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: '新建授权' }));
    const dialog = screen.getByRole('dialog', { name: '新建模型授权' });
    fireEvent.change(within(dialog).getByLabelText('资源类型'), { target: { value: 'MODEL' } });
    fireEvent.change(within(dialog).getByLabelText('资源'), { target: { value: 'model-1' } });
    fireEvent.change(within(dialog).getByLabelText('授权对象'), { target: { value: 'MEMBER' } });
    const member = await within(dialog).findByLabelText('成员');
    await within(dialog).findByRole('option', { name: 'Developer Two (developer.two)' });
    fireEvent.change(member, { target: { value: '303' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      body: { resourceId: 'model-1', resourceType: 'MODEL', status: 'ACTIVE', subjectId: '303', subjectType: 'MEMBER' },
      pathname: '/enterprise/admin/v1/model-grants'
    });
  });

  it('renders plugin facts and publishes a validated version with CAS', async () => {
    const writes = renderRoute('/plugins', 'enterprise_admin', 200, ['ent:plugin:write']);
    expect(await screen.findAllByText('Audit Tools')).toHaveLength(2);
    expect(screen.getByText('1.2.0')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '发布 @owndsh/audit-tools@1.2.0' }));
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
  it('keeps password login on the product page and renders every configured source', async () => {
    const passwordRequests: Request[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request
        ? input
        : new Request(new URL(String(input), window.location.origin), init);
      const pathname = new URL(request.url).pathname;
      if (pathname.endsWith('/enterprise/auth/v1/authorize')) {
        return json({
          data: {
            transactionId: 'tx_01J5T05PKCEDEVICELOGIN0000000',
            csrfToken: 'csrf_01J5T05PKCEDEVICELOGIN00000',
            sources: [
              { id: '1', name: 'Local', type: 'LOCAL' },
              { id: '2', name: 'Corporate LDAP', type: 'LDAP' },
              { id: '3', name: 'Company Keycloak', type: 'OIDC' },
              { id: '4', name: 'Partner Entra ID', type: 'OIDC' }
            ]
          },
          requestId: 'req_auth_start'
        });
      }
      if (pathname.endsWith('/auth/code')) {
        return json({ data: { captchaEnabled: true, uuid: 'captcha-1', img: 'captcha-image' } });
      }
      if (pathname.endsWith('/enterprise/auth/v1/password')) {
        passwordRequests.push(request.clone());
        return json({
          error: { code: 'ENT_AUTH_REQUIRED', message: '需要登录', requestId: 'req_auth', retryable: false, details: null }
        }, 401);
      }
      throw new Error(`unexpected request ${request.url}`);
    }));
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ['/login'] }),
      routeTree
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );

    expect(await screen.findByRole('tab', { name: '本地账户' })).toBeTruthy();
    expect(screen.getByPlaceholderText('请输入企业账号')).toBeTruthy();
    expect(screen.getByPlaceholderText('请输入登录密码')).toBeTruthy();
    expect(await screen.findByPlaceholderText('请输入验证码')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Corporate LDAP' }));
    expect(screen.getByRole('button', { name: '使用 Company Keycloak 登录' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '使用 Partner Entra ID 登录' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'not-logged' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(passwordRequests).toHaveLength(1));
    const form = new URLSearchParams(await passwordRequests[0]!.text());
    expect(form.get('sourceId')).toBe('2');
    expect(form.get('username')).toBe('alice');
    expect(form.get('password')).toBe('not-logged');
    expect(sessionStorage.getItem('enterprise-admin-pkce')).toContain('verifier');
  });

  it('opens account security as a real page and ends every browser session after password change', async () => {
    const writes = renderRoute('/', 'enterprise_admin');
    expect(await screen.findByRole('heading', { name: '模型' })).toBeTruthy();

    expect(document.querySelector('img[src="/owndsh-whale-mono-m2-animated.png"]')).toBeTruthy();
    fireEvent.click((await screen.findAllByRole('button', { name: 'OwnDsh' }))[0]!);
    const menu = document.querySelector('[data-workspace-menu]')!;
    const buttons = menu.querySelectorAll('button');
    expect(buttons.item(buttons.length - 2).textContent).toContain('用户中心');
    expect(buttons.item(buttons.length - 1).textContent).toContain('Sign out');
    fireEvent.click(screen.getByRole('button', { name: '用户中心' }));

    expect(await screen.findByRole('heading', { name: '用户中心' })).toBeTruthy();
    expect(screen.getByText('@candidate.admin')).toBeTruthy();
    expect(screen.getByText('candidate.admin@example.org')).toBeTruthy();
    expect(screen.getByText('本地 · 本地')).toBeTruthy();
    expect(screen.getByText('LDAP · Corporate LDAP')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: '安全设置' }));
    expect(await screen.findByRole('heading', { name: '修改密码' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'CurrentReady!42' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'ChangedReady!84' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'ChangedReady!84' } });
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      body: { currentPassword: 'CurrentReady!42', newPassword: 'ChangedReady!84' },
      method: 'PUT',
      pathname: '/enterprise/admin/v1/account/password'
    });
    expect(await screen.findByRole('heading', { name: '登录管理控制台' })).toBeTruthy();
  });

  it('keeps Sign out last and leaves the console only after Server logout succeeds', async () => {
    renderRoute('/', 'enterprise_admin');
    expect(await screen.findByRole('heading', { name: '模型' })).toBeTruthy();

    fireEvent.click((await screen.findAllByRole('button', { name: 'OwnDsh' }))[0]!);
    const menu = document.querySelector('[data-workspace-menu]')!;
    const buttons = menu.querySelectorAll('button');
    expect(buttons.item(buttons.length - 1).textContent).toContain('Sign out');

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: '登录管理控制台' })).toBeTruthy();
  });

  it('keeps the current page when the current password is rejected', async () => {
    renderRoute('/', 'enterprise_admin');
    expect(await screen.findByRole('heading', { name: '模型' })).toBeTruthy();
    fireEvent.click((await screen.findAllByRole('button', { name: 'OwnDsh' }))[0]!);
    fireEvent.click(screen.getByRole('button', { name: '用户中心' }));

    expect(await screen.findByRole('heading', { name: '用户中心' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: '安全设置' }));
    expect(await screen.findByRole('heading', { name: '修改密码' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'WrongCurrent!42' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'ChangedReady!84' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'ChangedReady!84' } });
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));

    expect((await screen.findByRole('alert')).textContent).toContain('当前密码不正确');
    expect(screen.queryByRole('heading', { name: '登录管理控制台' })).toBeNull();
  });

  it('keeps the console when Server logout fails', async () => {
    renderRoute('/', 'enterprise_admin', 500);
    expect(await screen.findByRole('heading', { name: '模型' })).toBeTruthy();
    fireEvent.click((await screen.findAllByRole('button', { name: 'OwnDsh' }))[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect((await screen.findByRole('alert')).textContent).toContain('会话仍然有效');
    expect(screen.getByRole('heading', { name: '模型' })).toBeTruthy();
  });

  it('uses the HttpOnly browser-session exchange without persisting a token in JavaScript', async () => {
    sessionStorage.setItem('enterprise-admin-pkce', JSON.stringify({
      state: 'expected', verifier: 'verifier', redirectUri: 'https://localhost/enterprise/auth/callback', returnTo: '/members'
    }));
    const fetchMock = vi.fn(async (_request: Request) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(completeEnterpriseAdminLogin('?code=code&state=expected')).resolves.toEqual({ returnTo: '/members' });
    const request = fetchMock.mock.calls[0]![0] as Request;
    expect(new URL(request.url).pathname).toBe('/enterprise/auth/v1/browser-session');
    expect(await request.clone().json()).toEqual({
      code: 'code', redirectUri: 'https://localhost/enterprise/auth/callback', codeVerifier: 'verifier'
    });
    expect(request.headers.get('Authorization')).toBeNull();
    expect(localStorage.getItem('Admin-Token')).toBeNull();
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
