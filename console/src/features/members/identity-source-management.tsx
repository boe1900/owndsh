/**
 * [INPUT]: 依赖身份源 operation、TanStack Query、产品表格/编辑器与 LDAP 组映射弹窗。
 * [OUTPUT]: 提供 OIDC/LDAP/LOCAL 身份接入、连接测试、启停，以及绑定具体 LDAP 来源的组映射入口。
 * [POS]: features/members 的身份接入工作台；Server 独占 secret、endpoint、revision 和身份源状态裁决。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Link2, Pencil, Plus, Power, PowerOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  createIdentitySource,
  disableIdentitySource,
  enableIdentitySource,
  listIdentitySources,
  testIdentitySource,
  updateIdentitySource
} from '@/api/generated/sdk.gen';
import type {
  EnterpriseErrorResponse,
  IdentitySource,
  IdentitySourceConnection,
  IdentitySourceCreateRequestWritable,
  IdentitySourcePageData,
  IdentitySourceUpdateRequestWritable
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { StatusPill } from '@/components/atoms/StatusPill';
import { ProductDataTable, type ProductTableColumn } from '@/components/product/DataTable';
import { IdentitySourceEditorDialog } from './identity-source-editor';
import { LdapGroupMappingDialog } from './ldap-group-mapping';

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'error' in error) {
    const payload = (error as EnterpriseErrorResponse).error;
    if (payload?.message) return payload.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function unwrapData<T>(result: { data?: { data: T }; error?: EnterpriseErrorResponse }, fallback: string) {
  if (result.error !== undefined || result.data === undefined) throw new Error(errorMessage(result.error, fallback));
  return result.data.data;
}

function nextCursor(page: IdentitySourcePageData) {
  return page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
}

function endpoint(source: IdentitySource) {
  return source.issuer ?? source.ldap?.url ?? '本地密码';
}

function lastTest(source: IdentitySource) {
  if (source.lastTestOk === undefined || !source.lastTestedAt) return '尚未测试';
  return `${source.lastTestOk ? '通过' : '失败'} · ${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(source.lastTestedAt))}`;
}

async function loadSources(cursor?: string) {
  return unwrapData<IdentitySourcePageData>(await listIdentitySources({ query: { cursor, limit: 100 } }), '身份源读取失败');
}

export function IdentitySourceManagement({ canWrite }: { canWrite: boolean }) {
  const [editor, setEditor] = useState<IdentitySource | 'new'>();
  const [mappingSource, setMappingSource] = useState<IdentitySource>();
  const [notice, setNotice] = useState<string>();
  const queryClient = useQueryClient();
  const sources = useInfiniteQuery({ queryKey: ['identity-sources', 'management'], queryFn: ({ pageParam }) => loadSources(pageParam), initialPageParam: undefined as string | undefined, getNextPageParam: nextCursor });
  const rows = useMemo(() => sources.data?.pages.flatMap((page) => page.items) ?? [], [sources.data]);
  const save = useMutation({
    mutationFn: async ({ current, value }: { current?: IdentitySource; value: IdentitySourceCreateRequestWritable | IdentitySourceUpdateRequestWritable }) => current
      ? unwrapData<IdentitySource>(await updateIdentitySource({ body: value, headers: { 'If-Match': current.revision }, path: { sourceId: current.id } }), '身份源更新失败')
      : unwrapData<IdentitySource>(await createIdentitySource({ body: value as IdentitySourceCreateRequestWritable, headers: { 'Idempotency-Key': crypto.randomUUID() } }), '身份源创建失败'),
    onSuccess: async (source) => {
      setEditor(undefined);
      setNotice(`${source.name} 已保存`);
      await queryClient.invalidateQueries({ queryKey: ['identity-sources'] });
    }
  });
  const test = useMutation({
    mutationFn: async (source: IdentitySource) => ({ source, result: unwrapData<IdentitySourceConnection>(await testIdentitySource({ path: { sourceId: source.id } }), '连接测试失败') }),
    onSuccess: async ({ source, result }) => {
      setNotice(`${source.name}：${result.diagnostic}`);
      await queryClient.invalidateQueries({ queryKey: ['identity-sources'] });
    }
  });
  const toggle = useMutation({
    mutationFn: async (source: IdentitySource) => unwrapData<IdentitySource>(await (source.status === 'ACTIVE' ? disableIdentitySource : enableIdentitySource)({ headers: { 'If-Match': source.revision }, path: { sourceId: source.id } }), '身份源状态更新失败'),
    onSuccess: async (source) => {
      setNotice(`${source.name} 已${source.status === 'ACTIVE' ? '启用' : '停用'}`);
      await queryClient.invalidateQueries({ queryKey: ['identity-sources'] });
    }
  });
  const columns = useMemo<ReadonlyArray<ProductTableColumn<IdentitySource>>>(() => [
    { accessorKey: 'name', header: '名称', meta: { label: '名称', className: 'w-[180px]', cellClassName: 'w-[180px]' } },
    { accessorKey: 'type', header: '类型', meta: { label: '类型', className: 'w-[90px]', cellClassName: 'w-[90px]' } },
    { accessorKey: 'provisioningMode', header: '首次登录', cell: ({ getValue }) => getValue() === 'JIT' ? 'JIT 自动创建' : '仅绑定', meta: { label: '首次登录', className: 'w-[130px]', cellClassName: 'w-[130px]' } },
    { id: 'endpoint', accessorFn: endpoint, header: '端点', cell: ({ getValue }) => <span className="block truncate" title={String(getValue())}>{String(getValue())}</span>, meta: { label: '端点', className: 'w-[240px]', cellClassName: 'w-[240px]' } },
    { id: 'secret', accessorFn: (source) => source.secretConfigured ? '已配置' : '未配置', header: '密钥', meta: { label: '密钥', className: 'w-[90px]', cellClassName: 'w-[90px]' } },
    { id: 'lastTest', accessorFn: lastTest, header: '最近测试', cell: ({ row, getValue }) => <span className={row.original.lastTestOk === false ? 'text-red' : ''}>{String(getValue())}</span>, meta: { label: '最近测试', className: 'w-[180px]', cellClassName: 'w-[180px]' } },
    { accessorKey: 'status', header: '状态', filterFn: 'equalsString', cell: ({ getValue }) => <StatusPill tone={getValue() === 'ACTIVE' ? 'green' : 'neutral'}>{getValue() === 'ACTIVE' ? '启用' : '停用'}</StatusPill>, meta: { label: '状态', className: 'w-[100px]', cellClassName: 'w-[100px]' } },
    {
      id: 'actions', header: '', enableGlobalFilter: false, enableHiding: false, enableSorting: false,
      cell: ({ row }) => <div className="flex items-center justify-end gap-1">
        {row.original.type === 'LDAP' ? <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" aria-label={`LDAP 组映射 ${row.original.name}`} title="LDAP 组映射" onClick={() => setMappingSource(row.original)}><Link2 aria-hidden className="size-3.5" /></Button> : null}
        {canWrite ? <>
          <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" aria-label={`编辑 ${row.original.name}`} title="编辑" onClick={() => { save.reset(); setEditor(row.original); }}><Pencil aria-hidden className="size-3.5" /></Button>
          {row.original.type !== 'LOCAL' ? <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={test.isPending} aria-label={`测试 ${row.original.name}`} title="连接测试" onClick={() => test.mutate(row.original)}><FlaskConical aria-hidden className="size-3.5" /></Button> : null}
          <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={toggle.isPending} aria-label={`${row.original.status === 'ACTIVE' ? '停用' : '启用'} ${row.original.name}`} title={row.original.status === 'ACTIVE' ? '停用' : '启用'} onClick={() => { if (row.original.status !== 'ACTIVE' || window.confirm(`确认停用 ${row.original.name}？`)) toggle.mutate(row.original); }}>{row.original.status === 'ACTIVE' ? <PowerOff aria-hidden className="size-3.5" /> : <Power aria-hidden className="size-3.5" />}</Button>
        </> : null}
      </div>,
      meta: { label: '操作', className: 'w-[150px]', cellClassName: 'w-[150px]' }
    }
  ], [canWrite, test.isPending, toggle.isPending]);
  const mutationError = test.error ?? toggle.error;

  return (
    <div className="grid gap-4">
      {notice ? <div role="status" className="rounded-lg bg-green-tint px-3 py-2 text-[12.5px] text-green">{notice}</div> : null}
      {mutationError ? <p role="alert" className="m-0 text-[12.5px] text-red">{errorMessage(mutationError, '身份源操作失败')}</p> : null}
      <ProductDataTable ariaLabel="身份源" columns={columns} data={rows} emptyText="暂无身份源" error={sources.error} filter={{ columnId: 'status', label: '全部状态', options: [{ label: '启用', value: 'ACTIVE' }, { label: '停用', value: 'DISABLED' }] }} getRowId={(row) => row.id} hasMore={sources.hasNextPage} isLoading={sources.isLoading} isLoadingMore={sources.isFetchingNextPage} onLoadMore={() => void sources.fetchNextPage()} onRetry={() => void sources.refetch()} searchPlaceholder="搜索名称、类型或端点" toolbarAction={canWrite ? <Button variant="primary" size="xs" onClick={() => { save.reset(); setEditor('new'); }}><Plus aria-hidden className="size-3.5" />新建身份源</Button> : undefined} />
      {editor ? <IdentitySourceEditorDialog current={editor === 'new' ? undefined : editor} error={save.error ? errorMessage(save.error, '身份源保存失败') : undefined} saving={save.isPending} onClose={() => setEditor(undefined)} onSave={(value) => save.mutate({ current: editor === 'new' ? undefined : editor, value })} /> : null}
      {mappingSource ? <LdapGroupMappingDialog source={mappingSource} canWrite={canWrite} onClose={() => setMappingSource(undefined)} /> : null}
    </div>
  );
}
