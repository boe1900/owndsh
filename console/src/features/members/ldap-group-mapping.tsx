/**
 * [INPUT]: 依赖选定 LDAP 身份源、目录组发现、外部组映射、产品用户组 operation、TanStack Query、产品对话框、lib/crypto 与 coss UI Button/Field/Input/RadioGroup/Select/Alert。
 * [OUTPUT]: 提供绑定单个 LDAP 身份源的 Group DN 映射列表、创建和删除操作；操作失败留在当前表单或确认弹窗，关闭后清理状态。
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Radio, RadioGroup } from '@/components/ui/radio-group';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/product/ConfirmDialog';
import { ProductDataTable, type ProductTableColumn } from '@/components/product/DataTable';
import { ProductDialog } from '@/components/product/Dialog';
import { DialogFooter } from '@/components/product/DialogFooter';
import { randomUuid } from '@/lib/crypto';

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

function MappingEditor({ accessGroups, error, onClose, onSave, saving, source }: {
  accessGroups: AccessGroup[];
  error?: string;
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
  const groupItems = accessGroups.map((group) => ({ label: group.name, value: group.id }));

  return (
    <ProductDialog className="max-w-[680px]" title={`映射 LDAP 组 · ${source.name}`} onClose={onClose}>
      <div className="grid gap-4 p-5">
        <div className="flex min-w-0 gap-2">
          <Input autoFocus aria-label="LDAP 组关键字" className="flex-1" maxLength={128} placeholder="搜索目录组" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Button type="button" size="sm" disabled={query.trim() === '' || search.isPending || saving} onClick={() => { setSelected(undefined); search.mutate(); }}>
            <Search aria-hidden className="size-3.5" />{search.isPending ? '搜索中' : '搜索'}
          </Button>
        </div>
        {search.data?.items.length === 0 ? <p className="m-0 text-[12.5px] text-muted-foreground">未找到匹配组</p> : null}
        {search.data?.items.length ? (
          <RadioGroup
            className="max-h-64 gap-0 divide-y overflow-y-auto border-y"
            value={selected?.externalGroup ?? ''}
            onValueChange={(next) => {
              const found = search.data?.items.find((item) => item.externalGroup === next);
              setSelected(found);
            }}
          >
            {search.data.items.map((group) => (
              <label key={group.externalGroup} className="flex cursor-pointer items-start gap-3 py-3 text-[12.5px]">
                <Radio className="mt-0.5" aria-label={`${group.displayName} ${group.externalGroup}`} value={group.externalGroup} />
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">{group.displayName}</span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground" title={group.externalGroup}>{group.externalGroup}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        ) : null}
        <Field className="w-full">
          <FieldLabel>产品用户组</FieldLabel>
          <Select items={groupItems} value={accessGroupId} disabled={accessGroups.length === 0 || saving} onValueChange={(next) => { if (next) setAccessGroupId(next); }}>
            <SelectTrigger aria-label="产品用户组">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {groupItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectPopup>
          </Select>
        </Field>
        {accessGroups.length === 0 ? <p className="m-0 text-[12.5px] text-muted-foreground">请先创建产品用户组</p> : null}
        {search.error ? <Alert variant="error"><AlertDescription>{message(search.error, 'LDAP 组搜索失败')}</AlertDescription></Alert> : null}
        {error ? <Alert variant="error"><AlertDescription>{error}</AlertDescription></Alert> : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>取消</Button>
        <Button type="button" size="sm" disabled={!selected || accessGroupId === '' || saving} onClick={() => selected && onSave(selected, accessGroupId)}>{saving ? '保存中' : '保存映射'}</Button>
      </DialogFooter>
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
  const [deleting, setDeleting] = useState<GroupMapping>();
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
      headers: { 'Idempotency-Key': randomUuid() }
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
    onSuccess: async () => {
      setDeleting(undefined);
      await queryClient.invalidateQueries({ queryKey: ['members', 'ldap-group-mappings', source.id] });
    }
  });
  const closeDelete = () => {
    if (remove.isPending) return;
    remove.reset();
    setDeleting(undefined);
  };
  const accessGroupNames = useMemo(() => new Map(accessGroups.data?.map((group) => [group.id, group.name])), [accessGroups.data]);
  const columns = useMemo<ReadonlyArray<ProductTableColumn<GroupMapping>>>(() => [
    { accessorKey: 'externalGroup', header: 'LDAP Group DN', cell: ({ getValue }) => <span className="block truncate font-mono text-xs text-muted-foreground" title={String(getValue())}>{String(getValue())}</span>, meta: { label: 'LDAP Group DN', className: 'w-[460px]', cellClassName: 'w-[460px]' } },
    { id: 'accessGroup', accessorFn: (row) => accessGroupNames.get(row.accessGroupId) ?? row.accessGroupId, header: '产品用户组', cell: ({ getValue }) => <span className="block truncate font-medium" title={String(getValue())}>{String(getValue())}</span>, meta: { label: '产品用户组', className: 'w-[220px]', cellClassName: 'w-[220px]' } },
    ...(canWrite ? [{ id: 'actions', header: '', enableGlobalFilter: false, enableHiding: false, enableSorting: false, cell: ({ row }: { row: { original: GroupMapping } }) => <Button variant="ghost" size="icon-xs" className="text-destructive-foreground hover:text-destructive-foreground" disabled={remove.isPending} aria-label="删除组映射" title="删除组映射" onClick={() => { remove.reset(); setDeleting(row.original); }}><Trash2 aria-hidden className="size-3.5" /></Button>, meta: { label: '操作', className: 'w-16', cellClassName: 'w-16' } } as ProductTableColumn<GroupMapping>] : [])
  ], [accessGroupNames, canWrite, remove.isPending]);
  const error = accessGroups.error ?? mappings.error;

  if (editing) {
    return <MappingEditor source={source} accessGroups={accessGroups.data ?? []} error={save.error ? message(save.error, 'LDAP 组映射保存失败') : undefined} saving={save.isPending} onClose={() => { save.reset(); setEditing(false); }} onSave={(group, accessGroupId) => save.mutate({ group, accessGroupId })} />;
  }

  if (deleting) {
    return (
      <ConfirmDialog
        title="确认删除"
        description={<span className="break-all">确定删除“{deleting.externalGroup}”的 LDAP 组映射？</span>}
        confirmLabel="删除"
        pendingLabel="删除中"
        saving={remove.isPending}
        error={remove.error ? message(remove.error, 'LDAP 组映射删除失败') : undefined}
        onClose={closeDelete}
        onConfirm={() => remove.mutate(deleting)}
      />
    );
  }

  return (
    <ProductDialog className="max-w-[1000px]" title={`LDAP 组映射 · ${source.name}`} onClose={onClose}>
      <div className="grid gap-4 p-5">
        <ProductDataTable className="max-h-[65dvh]" ariaLabel="LDAP 组映射" columns={columns} data={rows} emptyText="暂无 LDAP 组映射" error={error} getRowId={(row) => row.id} hasMore={mappings.hasNextPage} isLoading={mappings.isLoading} isLoadingMore={mappings.isFetchingNextPage} onLoadMore={() => void mappings.fetchNextPage()} onRetry={() => void mappings.refetch()} searchPlaceholder="搜索 Group DN 或产品用户组" toolbarAction={canWrite ? <Button size="sm" disabled={source.status !== 'ACTIVE' || !accessGroups.data?.length} title={source.status === 'ACTIVE' ? undefined : '请先启用身份源'} onClick={() => { save.reset(); setEditing(true); }}><Link2 aria-hidden />新建映射</Button> : undefined} />
      </div>
    </ProductDialog>
  );
}
