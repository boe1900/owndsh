/**
 * [INPUT]: 依赖生成的用户组 CRUD operation、TanStack Query/Form、成员目录与产品表格/对话框。
 * [OUTPUT]: 提供扁平用户组列表、创建、成员整体替换、删除和 revision CAS 管理视图。
 * [POS]: features/members 的批量授权主体管理器；只维护手工成员，身份源同步关系由 Server 独立持有。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useForm } from '@tanstack/react-form';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import {
  createAccessGroup,
  deleteAccessGroup,
  listAccessGroups,
  updateAccessGroup
} from '@/api/generated/sdk.gen';
import type {
  AccessGroup,
  AccessGroupPageData,
  AccessGroupWriteRequest,
  EnterpriseErrorResponse
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { ProductDataTable, type ProductTableColumn } from '@/components/product/DataTable';
import { ProductDialog } from '@/components/product/Dialog';
import { useMembers } from '@/features/member-select';

const inputClass = 'h-9 w-full rounded-lg border border-line bg-canvas px-3 text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint';

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

async function loadGroups(cursor?: string) {
  return unwrap<AccessGroupPageData>(await listAccessGroups({
    query: { limit: 100, ...(cursor ? { cursor } : {}) }
  }), '用户组加载失败');
}

function nextCursor(page: AccessGroupPageData) {
  return page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
}

function GroupEditor({ current, error, onClose, onSave, saving }: {
  current?: AccessGroup;
  error?: string;
  onClose: () => void;
  onSave: (value: AccessGroupWriteRequest) => void;
  saving: boolean;
}) {
  const members = useMembers();
  const form = useForm({
    defaultValues: { name: current?.name ?? '', memberIds: current?.manualMemberIds ?? [] },
    onSubmit: ({ value }) => onSave({ name: value.name.trim(), memberIds: value.memberIds })
  });

  return (
    <ProductDialog className="max-w-[640px]" title={current ? '编辑用户组' : '新建用户组'} onClose={onClose}>
      <form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(); }}>
        <form.Field name="name" validators={{ onSubmit: z.string().trim().min(1, '请输入用户组名称') }}>
          {(field) => (
            <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
              用户组名称
              <input autoFocus className={inputClass} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
              {field.state.meta.errors[0] ? <span role="alert" className="text-[12px] text-red">{String(field.state.meta.errors[0])}</span> : null}
            </label>
          )}
        </form.Field>
        <form.Field name="memberIds">
          {(field) => (
            <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
              手工成员
              <select
                multiple
                aria-label="手工成员"
                className="min-h-48 w-full rounded-lg border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
                disabled={members.isLoading || members.isError}
                value={field.state.value}
                onChange={(event) => field.handleChange(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}
              >
                {members.data?.map((member) => (
                  <option key={member.id} value={member.id} disabled={member.status === 'DISABLED'}>
                    {member.displayName} ({member.username}){member.status === 'DISABLED' ? ' - 已停用' : ''}
                  </option>
                ))}
              </select>
              {members.isError ? <span role="alert" className="text-[12px] text-red">{members.error.message}</span> : null}
            </label>
          )}
        </form.Field>
        {error ? <p role="alert" className="m-0 rounded-md bg-red-tint px-3 py-2 text-[12.5px] text-red">{error}</p> : null}
        <footer className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" size="sm" onClick={onClose}>取消</Button>
          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => <Button type="submit" variant="primary" size="sm" disabled={!canSubmit || saving || members.isLoading}>{saving ? '保存中' : '保存'}</Button>}
          </form.Subscribe>
        </footer>
      </form>
    </ProductDialog>
  );
}

export function AccessGroupManagement({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<'create' | AccessGroup>();
  const [deleting, setDeleting] = useState<AccessGroup>();
  const [notice, setNotice] = useState<string>();
  const groups = useInfiniteQuery({
    queryKey: ['members', 'access-groups'],
    queryFn: ({ pageParam }) => loadGroups(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: 30_000
  });
  const rows = useMemo(() => groups.data?.pages.flatMap((page) => page.items) ?? [], [groups.data]);
  const save = useMutation({
    mutationFn: async ({ current, value }: { current?: AccessGroup; value: AccessGroupWriteRequest }) => unwrap(
      current
        ? await updateAccessGroup({ body: value, headers: { 'If-Match': current.revision }, path: { accessGroupId: current.id } })
        : await createAccessGroup({ body: value, headers: { 'Idempotency-Key': crypto.randomUUID() } }),
      '用户组保存失败'
    ),
    onSuccess: async (_data, value) => {
      setEditor(undefined);
      setNotice(value.current ? '用户组已更新' : '用户组已创建');
      await queryClient.invalidateQueries({ queryKey: ['members', 'access-groups'] });
    }
  });
  const remove = useMutation({
    mutationFn: async (group: AccessGroup) => unwrap(await deleteAccessGroup({
      headers: { 'If-Match': group.revision },
      path: { accessGroupId: group.id }
    }), '用户组删除失败'),
    onSuccess: async () => {
      setDeleting(undefined);
      setNotice('用户组已删除');
      await queryClient.invalidateQueries({ queryKey: ['members', 'access-groups'] });
    }
  });
  const columns = useMemo<ReadonlyArray<ProductTableColumn<AccessGroup>>>(() => [
    { accessorKey: 'name', header: '用户组', cell: ({ getValue }) => <span className="block truncate font-medium" title={String(getValue())}>{String(getValue())}</span>, meta: { label: '用户组', className: 'w-[360px]', cellClassName: 'w-[360px]' } },
    { accessorKey: 'memberCount', header: '成员', meta: { label: '成员', className: 'w-[120px]', cellClassName: 'w-[120px]' } },
    { id: 'manualCount', accessorFn: (row) => row.manualMemberIds.length, header: '手工成员', meta: { label: '手工成员', className: 'w-[130px]', cellClassName: 'w-[130px]' } },
    ...(canWrite ? [{
      id: 'actions', header: '操作', enableGlobalFilter: false, enableHiding: false, enableSorting: false,
      cell: ({ row }: { row: { original: AccessGroup } }) => <div className="flex items-center gap-1">
        <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" aria-label={`编辑 ${row.original.name}`} title="编辑" onClick={() => { save.reset(); setEditor(row.original); }}><Pencil aria-hidden className="size-3.5" /></Button>
        <Button variant="quiet" size="xs" className="size-7 rounded-md p-0 text-red" aria-label={`删除 ${row.original.name}`} title="删除" onClick={() => { remove.reset(); setDeleting(row.original); }}><Trash2 aria-hidden className="size-3.5" /></Button>
      </div>,
      meta: { label: '操作', className: 'w-[90px]', cellClassName: 'w-[90px]' }
    } as ProductTableColumn<AccessGroup>] : [])
  ], [canWrite]);

  return (
    <>
      {notice ? <div role="status" className="rounded-lg bg-green-tint px-3 py-2 text-[12.5px] text-green">{notice}</div> : null}
      <ProductDataTable
        ariaLabel="用户组"
        columns={columns}
        data={rows}
        emptyText="暂无用户组"
        error={groups.error}
        getRowId={(row) => row.id}
        hasMore={groups.hasNextPage}
        isLoading={groups.isLoading}
        isLoadingMore={groups.isFetchingNextPage}
        onLoadMore={() => void groups.fetchNextPage()}
        onRetry={() => void groups.refetch()}
        searchPlaceholder="搜索用户组"
        toolbarAction={canWrite ? <Button variant="primary" size="xs" onClick={() => { save.reset(); setEditor('create'); }}><Plus aria-hidden className="size-3.5" />新建用户组</Button> : undefined}
      />
      {editor ? <GroupEditor key={editor === 'create' ? 'create' : editor.id} current={editor === 'create' ? undefined : editor} error={save.error ? message(save.error, '用户组保存失败') : undefined} saving={save.isPending} onClose={() => setEditor(undefined)} onSave={(value) => save.mutate({ current: editor === 'create' ? undefined : editor, value })} /> : null}
      {deleting ? <ProductDialog title="确认删除" onClose={() => setDeleting(undefined)}><div className="grid gap-5 p-5"><p className="m-0 text-[13px] text-ink-2">确定删除“{deleting.name}”？</p>{remove.error ? <p role="alert" className="m-0 text-[12.5px] text-red">{message(remove.error, '用户组删除失败')}</p> : null}<footer className="flex justify-end gap-2 border-t border-line pt-4"><Button size="sm" onClick={() => setDeleting(undefined)}>取消</Button><Button variant="primary" size="sm" className="bg-red text-white" disabled={remove.isPending} onClick={() => remove.mutate(deleting)}>{remove.isPending ? '删除中' : '删除'}</Button></footer></div></ProductDialog> : null}
    </>
  );
}
