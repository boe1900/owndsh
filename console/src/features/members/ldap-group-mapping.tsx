/**
 * [INPUT]: 依赖选定 LDAP 身份源、目录组发现、外部组映射、产品用户组 operation、TanStack Query 和产品对话框。
 * [OUTPUT]: 提供绑定单个 LDAP 身份源的 Group DN 映射列表、创建和删除操作。
 * [POS]: features/members 身份接入表格的 LDAP 行操作；只保存映射，不镜像目录成员、不展开嵌套组。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  createGroupMapping,
  deleteGroupMapping,
  listAccessGroups,
  listGroupMappings,
  searchLdapGroups
} from '@/api/generated/sdk.gen';
import type {
  AccessGroup,
  AccessGroupPageData,
  EnterpriseErrorResponse,
  GroupMapping,
  GroupMappingPageData,
  IdentitySource,
  LdapDirectoryGroup,
  LdapDirectoryGroupSearch
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { ProductDataTable, type ProductTableColumn } from '@/components/product/DataTable';
import { ProductDialog } from '@/components/product/Dialog';

const inputClass = 'h-9 min-w-0 rounded-lg border border-line bg-canvas px-3 text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint disabled:opacity-60';

function message(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'error' in error) {
    const payload = (error as EnterpriseErrorResponse).error;
    if (payload?.message) return payload.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function unwrap<T>(result: { data?: { data: T }; error?: EnterpriseErrorResponse }, fallback: string) {
  if (result.error !== undefined || result.data === undefined) throw new Error(message(result.error, fallback));
  return result.data.data;
}

async function loadAccessGroups(): Promise<AccessGroup[]> {
  return unwrap<AccessGroupPageData>(await listAccessGroups({ query: { limit: 200 } }), '用户组读取失败').items;
}

async function loadMappings(sourceId: string, cursor?: string) {
  return unwrap<GroupMappingPageData>(await listGroupMappings({
    query: { sourceId, limit: 100, ...(cursor ? { cursor } : {}) }
  }), 'LDAP 组映射读取失败');
}

function nextCursor(page: GroupMappingPageData) {
  return page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
}

function MappingEditor({ accessGroups, onClose, onSave, saving, source }: {
  accessGroups: AccessGroup[];
  onClose: () => void;
  onSave: (group: LdapDirectoryGroup, accessGroupId: string) => void;
  saving: boolean;
  source: IdentitySource;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<LdapDirectoryGroup>();
  const [accessGroupId, setAccessGroupId] = useState(accessGroups[0]?.id ?? '');
  const search = useMutation({
    mutationFn: async () => unwrap<LdapDirectoryGroupSearch>(await searchLdapGroups({
      path: { sourceId: source.id }, query: { query: query.trim(), limit: 50 }
    }), 'LDAP 组搜索失败')
  });

  return (
    <ProductDialog className="max-w-[680px]" title={`映射 LDAP 组 · ${source.name}`} onClose={onClose}>
      <div className="grid gap-4 p-5">
        <div className="flex min-w-0 gap-2">
          <input autoFocus aria-label="LDAP 组关键字" className={`${inputClass} flex-1`} maxLength={128} placeholder="搜索目录组" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Button type="button" size="sm" disabled={query.trim() === '' || search.isPending || saving} onClick={() => { setSelected(undefined); search.mutate(); }}>
            <Search aria-hidden className="size-3.5" />{search.isPending ? '搜索中' : '搜索'}
          </Button>
        </div>
        {search.data?.items.length === 0 ? <p className="m-0 text-[12.5px] text-ink-3">未找到匹配组</p> : null}
        {search.data?.items.length ? (
          <div className="max-h-64 divide-y divide-line overflow-y-auto border-y border-line">
            {search.data.items.map((group) => (
              <label key={group.externalGroup} className="flex cursor-pointer items-start gap-3 py-3 text-[12.5px]">
                <input type="radio" name="ldap-group" checked={selected?.externalGroup === group.externalGroup} onChange={() => setSelected(group)} />
                <span className="min-w-0"><span className="block font-medium text-ink">{group.displayName}</span><span className="block truncate font-mono text-[11px] text-ink-3" title={group.externalGroup}>{group.externalGroup}</span></span>
              </label>
            ))}
          </div>
        ) : null}
        <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
          产品用户组
          <select className={inputClass} value={accessGroupId} disabled={accessGroups.length === 0 || saving} onChange={(event) => setAccessGroupId(event.target.value)}>
            {accessGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </label>
        {accessGroups.length === 0 ? <p className="m-0 text-[12.5px] text-ink-3">请先创建产品用户组</p> : null}
        {search.error ? <p role="alert" className="m-0 text-[12.5px] text-red">{message(search.error, 'LDAP 组搜索失败')}</p> : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
        <Button type="button" size="sm" onClick={onClose}>取消</Button>
        <Button type="button" variant="primary" size="sm" disabled={!selected || accessGroupId === '' || saving} onClick={() => selected && onSave(selected, accessGroupId)}>{saving ? '保存中' : '保存映射'}</Button>
      </footer>
    </ProductDialog>
  );
}

export function LdapGroupMappingDialog({ canWrite, onClose, source }: {
  canWrite: boolean;
  onClose: () => void;
  source: IdentitySource;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const accessGroups = useQuery({ queryKey: ['members', 'access-groups', 'mapping'], queryFn: loadAccessGroups });
  const mappings = useInfiniteQuery({
    queryKey: ['members', 'ldap-group-mappings', source.id],
    queryFn: ({ pageParam }) => loadMappings(source.id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor
  });
  const rows = useMemo(() => mappings.data?.pages.flatMap((page) => page.items) ?? [], [mappings.data]);
  const save = useMutation({
    mutationFn: async ({ group, accessGroupId }: { group: LdapDirectoryGroup; accessGroupId: string }) => unwrap(await createGroupMapping({
      body: { sourceId: source.id, externalGroup: group.externalGroup, accessGroupId },
      headers: { 'Idempotency-Key': crypto.randomUUID() }
    }), 'LDAP 组映射保存失败'),
    onSuccess: async () => {
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['members', 'ldap-group-mappings', source.id] });
    }
  });
  const remove = useMutation({
    mutationFn: async (mapping: GroupMapping) => unwrap(await deleteGroupMapping({
      headers: { 'If-Match': mapping.revision }, path: { mappingId: mapping.id }
    }), 'LDAP 组映射删除失败'),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['members', 'ldap-group-mappings', source.id] })
  });
  const accessGroupNames = useMemo(() => new Map(accessGroups.data?.map((group) => [group.id, group.name])), [accessGroups.data]);
  const columns = useMemo<ReadonlyArray<ProductTableColumn<GroupMapping>>>(() => [
    { accessorKey: 'externalGroup', header: 'LDAP Group DN', cell: ({ getValue }) => <span className="block truncate font-mono text-[11px]" title={String(getValue())}>{String(getValue())}</span>, meta: { label: 'LDAP Group DN', className: 'w-[560px]', cellClassName: 'w-[560px]' } },
    { id: 'accessGroup', accessorFn: (row) => accessGroupNames.get(row.accessGroupId) ?? row.accessGroupId, header: '产品用户组', meta: { label: '产品用户组', className: 'w-[220px]', cellClassName: 'w-[220px]' } },
    ...(canWrite ? [{ id: 'actions', header: '', enableGlobalFilter: false, enableHiding: false, enableSorting: false, cell: ({ row }: { row: { original: GroupMapping } }) => <Button variant="quiet" size="xs" className="size-7 rounded-md p-0 text-red" disabled={remove.isPending} aria-label="删除组映射" title="删除组映射" onClick={() => { if (window.confirm(`确认删除 ${row.original.externalGroup} 的映射？`)) remove.mutate(row.original); }}><Trash2 aria-hidden className="size-3.5" /></Button>, meta: { label: '操作', className: 'w-16', cellClassName: 'w-16' } } as ProductTableColumn<GroupMapping>] : [])
  ], [accessGroupNames, canWrite, remove.isPending]);
  const error = accessGroups.error ?? mappings.error ?? save.error ?? remove.error;

  if (editing) {
    return <MappingEditor source={source} accessGroups={accessGroups.data ?? []} saving={save.isPending} onClose={() => setEditing(false)} onSave={(group, accessGroupId) => save.mutate({ group, accessGroupId })} />;
  }

  return (
    <ProductDialog className="max-w-[1000px]" title={`LDAP 组映射 · ${source.name}`} onClose={onClose}>
      <div className="grid gap-4 p-5">
        <ProductDataTable ariaLabel="LDAP 组映射" columns={columns} data={rows} emptyText="暂无 LDAP 组映射" error={error} getRowId={(row) => row.id} hasMore={mappings.hasNextPage} isLoading={mappings.isLoading} isLoadingMore={mappings.isFetchingNextPage} onLoadMore={() => void mappings.fetchNextPage()} onRetry={() => void mappings.refetch()} searchPlaceholder="搜索 Group DN 或产品用户组" toolbarAction={canWrite ? <Button variant="primary" size="xs" disabled={source.status !== 'ACTIVE' || !accessGroups.data?.length} title={source.status === 'ACTIVE' ? undefined : '请先启用身份源'} onClick={() => { save.reset(); setEditing(true); }}><Link2 aria-hidden className="size-3.5" />新建映射</Button> : undefined} />
      </div>
    </ProductDialog>
  );
}
