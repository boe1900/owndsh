/**
 * [INPUT]: 依赖生成的用户组 CRUD operation、TanStack Query/Form、成员目录、产品表格/对话框、lib/crypto 与 coss UI Button/Card/Checkbox/Field/Input/InputGroup/Alert。
 * [OUTPUT]: 提供扁平用户组列表、创建、成员整体替换、删除和 revision CAS 管理视图；删除失败只在当前确认弹窗呈现，关闭后清理状态。
 * [POS]: features/members 的批量授权主体管理器；只维护手工成员，身份源同步关系由 Server 独立持有。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useForm } from '@tanstack/react-form';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { ConfirmDialog } from '@/components/product/ConfirmDialog';
import { ProductDataTable, type ProductTableColumn } from '@/components/product/DataTable';
import { ProductDialog } from '@/components/product/Dialog';
import { DialogFooter } from '@/components/product/DialogFooter';
import { useMembers } from '@/features/member-select';
import { randomUuid } from '@/lib/crypto';

function message(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'error' in error) {
    const payload = (error as EnterpriseErrorResponse).error;
    if (payload?.message) {
      if (payload.code === 'ENT_RESOURCE_IN_USE' && payload.details
        && typeof payload.details === 'object'
        && 'modelGrantCount' in payload.details && 'mcpGrantCount' in payload.details
        && 'quotaPolicyCount' in payload.details
        && 'externalGroupMappingCount' in payload.details) {
        const details = payload.details;
        const references = [
          details.modelGrantCount > 0 ? `模型访问授权 ${details.modelGrantCount} 条` : undefined,
          details.mcpGrantCount > 0 ? `MCP 授权 ${details.mcpGrantCount} 条` : undefined,
          details.quotaPolicyCount > 0 ? `配额策略 ${details.quotaPolicyCount} 条` : undefined,
          details.externalGroupMappingCount > 0 ? `外部组映射 ${details.externalGroupMappingCount} 条` : undefined
        ].filter((value): value is string => value !== undefined);
        return references.length > 0 ? `${payload.message}（${references.join('、')}）` : payload.message;
      }
      return payload.message;
    }
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
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const visibleMembers = useMemo(
    () => (members.data ?? []).filter((member) => !query || [member.displayName, member.username].some((item) => item.toLowerCase().includes(query))),
    [members.data, query]
  );
  const form = useForm({
    defaultValues: { name: current?.name ?? '', memberIds: current?.manualMemberIds ?? [] },
    onSubmit: ({ value }) => onSave({ name: value.name.trim(), memberIds: value.memberIds })
  });

  return (
    <ProductDialog className="max-w-[640px]" title={current ? '编辑用户组' : '新建用户组'} onClose={onClose}>
      <form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(); }}>
        <form.Field name="name" validators={{ onSubmit: z.string().trim().min(1, '请输入用户组名称') }}>
          {(field) => (
            <Field className="w-full" invalid={field.state.meta.errors.length > 0}>
              <FieldLabel>用户组名称</FieldLabel>
              <Input autoFocus value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
              {field.state.meta.errors[0] ? <FieldError>{String(field.state.meta.errors[0])}</FieldError> : null}
            </Field>
          )}
        </form.Field>
        <form.Field name="memberIds">
          {(field) => (
            <div className="grid w-full gap-2">
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">手工成员</span>
                <span className="text-[11px] text-muted-foreground">已选 {field.state.value.length} 人</span>
              </div>
              <Card className="w-full gap-2.5 bg-muted/40 p-3 shadow-none">
                <InputGroup>
                  <InputGroupAddon align="inline-start"><Search aria-hidden className="size-3.5 text-muted-foreground" /></InputGroupAddon>
                  <InputGroupInput aria-label="搜索手工成员" size="sm" placeholder="搜索成员姓名或账号..." value={search} onChange={(event) => setSearch(event.target.value)} />
                  {search ? (
                    <InputGroupAddon align="inline-end">
                      <Button type="button" variant="ghost" size="icon-xs" aria-label="清除搜索" onClick={() => setSearch('')}><X aria-hidden className="size-3.5" /></Button>
                    </InputGroupAddon>
                  ) : null}
                </InputGroup>
                <div className="grid max-h-48 gap-1.5 overflow-y-auto pr-1" role="group" aria-label="手工成员">
                  {visibleMembers.map((member) => {
                    const label = `${member.displayName} (${member.username})${member.status === 'DISABLED' ? ' - 已停用' : ''}`;
                    const cbId = `group-member-${member.id}`;
                    const checked = field.state.value.includes(member.id);
                    return (
                      <div key={member.id} className={`flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2 text-[13px] transition hover:bg-accent ${member.status === 'DISABLED' ? 'opacity-50' : ''}`}>
                        <Checkbox
                          id={cbId}
                          checked={checked}
                          disabled={members.isLoading || members.isError || member.status === 'DISABLED'}
                          onCheckedChange={(next) => {
                            const updated = next
                              ? [...field.state.value, member.id]
                              : field.state.value.filter((id) => id !== member.id);
                            field.handleChange(updated);
                          }}
                        />
                        <label htmlFor={cbId} className={`min-w-0 flex-1 truncate ${member.status === 'DISABLED' ? 'cursor-not-allowed' : 'cursor-pointer select-none'}`}>{label}</label>
                      </div>
                    );
                  })}
                </div>
              </Card>
              {members.isError ? <FieldError>{members.error.message}</FieldError> : null}
            </div>
          )}
        </form.Field>
        {error ? <Alert variant="error"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <DialogFooter sticky>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>取消</Button>
          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => <Button type="submit" size="sm" disabled={!canSubmit || saving || members.isLoading}>{saving ? '保存中' : '保存'}</Button>}
          </form.Subscribe>
        </DialogFooter>
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
        : await createAccessGroup({ body: value, headers: { 'Idempotency-Key': randomUuid() } }),
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
  const closeDelete = () => {
    if (remove.isPending) return;
    remove.reset();
    setDeleting(undefined);
  };
  const columns = useMemo<ReadonlyArray<ProductTableColumn<AccessGroup>>>(() => [
    { accessorKey: 'name', header: '用户组', cell: ({ getValue }) => <span className="block truncate font-medium" title={String(getValue())}>{String(getValue())}</span>, meta: { label: '用户组', className: 'w-[360px]', cellClassName: 'w-[360px]' } },
    { accessorKey: 'memberCount', header: '成员', cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground tabular-nums">{String(getValue())}</span>, meta: { label: '成员', className: 'w-[120px]', cellClassName: 'w-[120px]' } },
    { id: 'manualCount', accessorFn: (row) => row.manualMemberIds.length, header: '手工成员', cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground tabular-nums">{String(getValue())}</span>, meta: { label: '手工成员', className: 'w-[130px]', cellClassName: 'w-[130px]' } },
    ...(canWrite ? [{
      id: 'actions', header: '操作', enableGlobalFilter: false, enableHiding: false, enableSorting: false,
      cell: ({ row }: { row: { original: AccessGroup } }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-xs" aria-label={`编辑 ${row.original.name}`} title="编辑" onClick={() => { save.reset(); setEditor(row.original); }}><Pencil aria-hidden className="size-3.5" /></Button>
          <Button variant="ghost" size="icon-xs" className="text-destructive-foreground hover:text-destructive-foreground" aria-label={`删除 ${row.original.name}`} title="删除" onClick={() => { remove.reset(); setNotice(undefined); setDeleting(row.original); }}><Trash2 aria-hidden className="size-3.5" /></Button>
        </div>
      ),
      meta: { label: '操作', className: 'w-[90px]', cellClassName: 'w-[90px]' }
    } as ProductTableColumn<AccessGroup>] : [])
  ], [canWrite]);

  return (
    <>
      {notice ? <Alert variant="success"><AlertDescription>{notice}</AlertDescription></Alert> : null}
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
        toolbarAction={canWrite ? <Button size="sm" onClick={() => { save.reset(); setEditor('create'); }}><Plus aria-hidden />新建用户组</Button> : undefined}
      />
      {editor ? <GroupEditor key={editor === 'create' ? 'create' : editor.id} current={editor === 'create' ? undefined : editor} error={save.error ? message(save.error, '用户组保存失败') : undefined} saving={save.isPending} onClose={() => setEditor(undefined)} onSave={(value) => save.mutate({ current: editor === 'create' ? undefined : editor, value })} /> : null}
      {deleting ? (
        <ConfirmDialog
          title="确认删除"
          description={`确定删除“${deleting.name}”？`}
          detail="如果该用户组已被模型/MCP 授权或外部组映射引用，需先解除关联。"
          confirmLabel="删除"
          pendingLabel="删除中"
          saving={remove.isPending}
          error={remove.error ? message(remove.error, '用户组删除失败') : undefined}
          onClose={closeDelete}
          onConfirm={() => remove.mutate(deleting)}
        />
      ) : null}
    </>
  );
}
