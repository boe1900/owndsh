/**
 * [INPUT]: 依赖技能管理页、生成 SDK、Query 与 Testing Library，HTTP 使用可控响应。
 * [OUTPUT]: 验证待发布新版本的折叠红点与行级发布、版本历史内发布、默认全状态筛选可见性和导入后立即发布。
 * [POS]: features/skills 的升级交互回归；导入校验与状态机保留由服务端 PostgreSQL 验收。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { client } from '@/api/generated/client.gen';
import type { SkillRelease } from '@/api/generated/types.gen';
import { SkillManagementPage } from './skill-management-page';

const release = (overrides: Partial<SkillRelease> & Pick<SkillRelease, 'id' | 'name' | 'version'>): SkillRelease => ({
  description: 'Review assistant', license: 'MIT', author: 'OwnDsh', userInvocable: true, modelInvocable: true,
  categories: ['代码审查'], artifactSizeBytes: 8192, artifactSha256: 'a'.repeat(64), status: 'PUBLISHED',
  revision: 1, repositoryUrl: 'https://gitlab.corp.com/ai-team/code-review', resolvedCommit: 'abcdef0123456789',
  credentialId: null, releaseNotes: '', current: false, ...overrides
});

let releases: SkillRelease[];
let writes: Array<{ path: string; revision: string | null }>;

beforeEach(() => {
  writes = [];
  releases = [
    release({ id: '11', name: 'code-review', version: '1.0.0', status: 'PUBLISHED', current: true, revision: 2 }),
    release({ id: '12', name: 'code-review', version: '1.2.0', status: 'DRAFT', revision: 3, releaseNotes: '升级说明' })
  ];
  client.setConfig({ baseUrl: 'http://localhost' });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (request.method === 'GET' && path === '/enterprise/admin/v1/skill-credentials') return respond({ data: [] });
    if (request.method === 'GET') return respond({ data: { items: releases, page: { hasMore: false, nextCursor: null, limit: 200 } } });
    writes.push({ path, revision: request.headers.get('If-Match') });
    if (path.endsWith('/actions/publish')) {
      const id = path.split('/').at(-3) as string;
      const target = releases.find(item => item.id === id);
      releases = releases.map(row => row.id === id
        ? { ...row, status: 'PUBLISHED', current: true, revision: row.revision + 1 }
        : target && row.name === target.name ? { ...row, current: false } : row);
      return respond({ data: {} });
    }
    if (path === '/enterprise/admin/v1/skills/imports') {
      const body = JSON.parse(await request.text()) as { revision: string };
      const created = release({ id: '13', name: 'code-review', version: body.revision.replace(/^v/, ''), status: 'DRAFT', revision: 0, resolvedCommit: '1234567890abcdef' });
      releases = [...releases, created];
      return respond({ data: { release: created } }, 201);
    }
    throw new Error(`Unexpected write: ${path}`);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function show() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><SkillManagementPage /></QueryClientProvider>);
}

async function confirmPublish(expectedPath: string, expectedRevision: string) {
  const dialog = await screen.findByRole('dialog', { name: '发布技能' });
  fireEvent.click(within(dialog).getByRole('button', { name: '发布' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '发布技能' })).toBeNull());
  expect(writes).toContainEqual({ path: expectedPath, revision: expectedRevision });
}

it('folds the pending upgrade into the aggregated row with a red-dot hint and publishes it in one request', async () => {
  show();
  expect(await screen.findByText('v1.0.0')).toBeDefined();
  expect(screen.queryByText('v1.2.0')).toBeNull();
  expect(screen.getByTitle('版本历史 · 有待发布的 v1.2.0')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: '发布待发布版本 v1.2.0' }));
  await confirmPublish('/enterprise/admin/v1/skills/releases/12/actions/publish', '3');
  expect(await screen.findByText('v1.2.0')).toBeDefined();
  expect(screen.getByTitle('版本历史')).toBeDefined();
});

it('publishes the pending draft from the version history dialog', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: '查看版本历史' }));
  const dialog = await screen.findByRole('dialog', { name: /版本历史/ });
  expect(within(dialog).getByText('v1.2.0')).toBeDefined();
  fireEvent.click(within(dialog).getByRole('button', { name: '发布' }));
  await confirmPublish('/enterprise/admin/v1/skills/releases/12/actions/publish', '3');
  expect(await screen.findByText('v1.2.0')).toBeDefined();
});

it('shows draft-only and revoked skills under the default all-status filter', async () => {
  releases = [
    release({ id: '21', name: 'new-skill', version: '0.9.0', status: 'DRAFT', revision: 0 }),
    release({ id: '22', name: 'legacy-skill', version: '0.8.0', status: 'REVOKED', revision: 4 })
  ];
  show();
  expect(await screen.findByText('v0.9.0')).toBeDefined();
  expect(screen.getByText('v0.8.0')).toBeDefined();
  expect(screen.getAllByRole('button', { name: '发布技能' })).toHaveLength(2);
  expect(screen.getByTitle('恢复发布')).toBeDefined();
});

it('offers immediate publish right after importing a new version', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: '导入技能' }));
  const dialog = await screen.findByRole('dialog', { name: '导入技能' });
  fireEvent.change(within(dialog).getByLabelText('仓库地址'), { target: { value: 'https://gitlab.corp.com/ai-team/code-review' } });
  fireEvent.change(within(dialog).getByPlaceholderText('v1.2.0 或 commit SHA'), { target: { value: 'v1.3.0' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '预检并创建草稿' }));
  const preview = await screen.findByRole('dialog', { name: '导入完成 · 草稿已创建' });
  fireEvent.click(within(preview).getByRole('button', { name: '立即发布' }));
  await confirmPublish('/enterprise/admin/v1/skills/releases/13/actions/publish', '0');
  expect(await screen.findByText('v1.3.0')).toBeDefined();
});
