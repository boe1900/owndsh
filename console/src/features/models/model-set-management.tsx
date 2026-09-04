/**
 * [INPUT]: 依赖生成的模型集/受管模型 operation、TanStack Query/Form 与产品表格/对话框。
 * [OUTPUT]: 提供带供应商/模型 ID 辨识的扁平模型集列表、创建、整体替换、删除和 revision CAS 管理视图。
 * [POS]: features/models 的批量授权资源管理器；内部只保存受管模型 ID，供应商信息来自目录投影。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useForm } from '@tanstack/react-form';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import {
  createModelSet,
  deleteModelSet,
  listManagedModels,
  listModelSets,
  updateModelSet
} from '@/api/generated/sdk.gen';
import type {
  EnterpriseErrorResponse,
  ManagedModel,
  ManagedModelPageData,
  ModelSet,
  ModelSetPageData,
  ModelSetWriteRequest
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { ProductDataTable, type ProductTableColumn } from '@/components/product/DataTable';
import { ProductDialog } from '@/components/product/Dialog';

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

async function loadSets(cursor?: string) {
  return unwrap<ModelSetPageData>(await listModelSets({
    query: { limit: 100, ...(cursor ? { cursor } : {}) }
  }), '模型集加载失败');
}

async function loadAllModels() {
  const items: ManagedModel[] = [];
  let cursor: string | undefined;
  do {
    const page = unwrap<ManagedModelPageData>(await listManagedModels({
      query: { limit: 200, ...(cursor ? { cursor } : {}) }
    }), '受管模型加载失败');
    items.push(...page.items);
    cursor = page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
  } while (cursor);
  return items;
}

function nextCursor(page: ModelSetPageData) {
  return page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
}

function ModelSetEditor({ current, error, models, onClose, onSave, saving }: {
  current?: ModelSet;
  error?: string;
  models: ReadonlyArray<ManagedModel>;
  onClose: () => void;
  onSave: (value: ModelSetWriteRequest) => void;
  saving: boolean;
}) {
  const form = useForm({
    defaultValues: { name: current?.name ?? '', modelIds: current?.modelIds ?? [] },
    onSubmit: ({ value }) => onSave({ name: value.name.trim(), modelIds: value.modelIds })
  });
  return (
    <ProductDialog className="max-w-[640px]" title={current ? '编辑模型集' : '新建模型集'} onClose={onClose}>
      <form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(); }}>
        <form.Field name="name" validators={{ onSubmit: z.string().trim().min(1, '请输入模型集名称') }}>
          {(field) => (
            <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
              模型集名称
              <input autoFocus className={inputClass} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
              {field.state.meta.errors[0] ? <span role="alert" className="text-[12px] text-red">{String(field.state.meta.errors[0])}</span> : null}
            </label>
          )}
        </form.Field>
        <form.Field name="modelIds">
          {(field) => (
            <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
              模型
              <select
                multiple
                aria-label="模型"
                className="min-h-48 w-full rounded-lg border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint"
                value={field.state.value}
                onChange={(event) => field.handleChange(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id} disabled={model.status === 'DISABLED'}>
                    {model.providerName} / {model.alias}{model.status === 'DISABLED' ? ' - 已停用' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </form.Field>
        {error ? <p role="alert" className="m-0 rounded-md bg-red-tint px-3 py-2 text-[12.5px] text-red">{error}</p> : null}
        <footer className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" size="sm" onClick={onClose}>取消</Button>
          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => <Button type="submit" variant="primary" size="sm" disabled={!canSubmit || saving}>{saving ? '保存中' : '保存'}</Button>}
          </form.Subscribe>
        </footer>
      </form>
    </ProductDialog>
  );
}

export function ModelSetManagement({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<'create' | ModelSet>();
  const [deleting, setDeleting] = useState<ModelSet>();
  const [notice, setNotice] = useState<string>();
  const sets = useInfiniteQuery({
    queryKey: ['models', 'sets'],
    queryFn: ({ pageParam }) => loadSets(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: 30_000
  });
  const models = useQuery({ queryKey: ['models', 'set-options'], queryFn: loadAllModels, staleTime: 30_000 });
  const rows = useMemo(() => sets.data?.pages.flatMap((page) => page.items) ?? [], [sets.data]);
  const names = useMemo(() => new Map(
    models.data?.map((model) => [model.id, `${model.providerName} / ${model.alias}`])
  ), [models.data]);
  const save = useMutation({
    mutationFn: async ({ current, value }: { current?: ModelSet; value: ModelSetWriteRequest }) => unwrap(
      current
        ? await updateModelSet({ body: value, headers: { 'If-Match': current.revision }, path: { modelSetId: current.id } })
        : await createModelSet({ body: value, headers: { 'Idempotency-Key': crypto.randomUUID() } }),
      '模型集保存失败'
    ),
    onSuccess: async (_data, value) => {
      setEditor(undefined);
      setNotice(value.current ? '模型集已更新' : '模型集已创建');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['models', 'sets'] }),
        queryClient.invalidateQueries({ queryKey: ['access', 'model-sets'] })
      ]);
    }
  });
  const remove = useMutation({
    mutationFn: async (set: ModelSet) => unwrap(await deleteModelSet({
      headers: { 'If-Match': set.revision },
      path: { modelSetId: set.id }
    }), '模型集删除失败'),
    onSuccess: async () => {
      setDeleting(undefined);
      setNotice('模型集已删除');
      await queryClient.invalidateQueries({ queryKey: ['models', 'sets'] });
    }
  });
  const columns = useMemo<ReadonlyArray<ProductTableColumn<ModelSet>>>(() => [
    { accessorKey: 'name', header: '模型集', cell: ({ getValue }) => <span className="block truncate font-medium" title={String(getValue())}>{String(getValue())}</span>, meta: { label: '模型集', className: 'w-[280px]', cellClassName: 'w-[280px]' } },
    { accessorKey: 'modelCount', header: '模型数', meta: { label: '模型数', className: 'w-[100px]', cellClassName: 'w-[100px]' } },
    {
      id: 'models', accessorFn: (row) => row.modelIds.map((id) => names.get(id) ?? id).join('、'), header: '包含模型',
      cell: ({ getValue }) => <span className="block truncate" title={String(getValue())}>{String(getValue()) || '空模型集'}</span>,
      meta: { label: '包含模型', className: 'w-[420px]', cellClassName: 'w-[420px]' }
    },
    ...(canWrite ? [{
      id: 'actions', header: '操作', enableGlobalFilter: false, enableHiding: false, enableSorting: false,
      cell: ({ row }: { row: { original: ModelSet } }) => <div className="flex items-center gap-1">
        <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" aria-label={`编辑 ${row.original.name}`} title="编辑" onClick={() => { save.reset(); setEditor(row.original); }}><Pencil aria-hidden className="size-3.5" /></Button>
        <Button variant="quiet" size="xs" className="size-7 rounded-md p-0 text-red" aria-label={`删除 ${row.original.name}`} title="删除" onClick={() => { remove.reset(); setDeleting(row.original); }}><Trash2 aria-hidden className="size-3.5" /></Button>
      </div>,
      meta: { label: '操作', className: 'w-[90px]', cellClassName: 'w-[90px]' }
    } as ProductTableColumn<ModelSet>] : [])
  ], [canWrite, names]);

  return (
    <>
      {notice ? <div role="status" className="rounded-lg bg-green-tint px-3 py-2 text-[12.5px] text-green">{notice}</div> : null}
      <ProductDataTable
        ariaLabel="模型集"
        columns={columns}
        data={rows}
        emptyText="暂无模型集"
        error={sets.error}
        getRowId={(row) => row.id}
        hasMore={sets.hasNextPage}
        isLoading={sets.isLoading}
        isLoadingMore={sets.isFetchingNextPage}
        onLoadMore={() => void sets.fetchNextPage()}
        onRetry={() => void sets.refetch()}
        searchPlaceholder="搜索模型集或模型"
        toolbarAction={canWrite ? <Button variant="primary" size="xs" disabled={models.isLoading || models.isError} onClick={() => { save.reset(); setEditor('create'); }}><Plus aria-hidden className="size-3.5" />新建模型集</Button> : undefined}
      />
      {editor ? <ModelSetEditor key={editor === 'create' ? 'create' : editor.id} current={editor === 'create' ? undefined : editor} error={save.error ? message(save.error, '模型集保存失败') : undefined} models={models.data ?? []} saving={save.isPending} onClose={() => setEditor(undefined)} onSave={(value) => save.mutate({ current: editor === 'create' ? undefined : editor, value })} /> : null}
      {deleting ? <ProductDialog title="确认删除" onClose={() => setDeleting(undefined)}><div className="grid gap-5 p-5"><p className="m-0 text-[13px] text-ink-2">确定删除“{deleting.name}”？</p>{remove.error ? <p role="alert" className="m-0 text-[12.5px] text-red">{message(remove.error, '模型集删除失败')}</p> : null}<footer className="flex justify-end gap-2 border-t border-line pt-4"><Button size="sm" onClick={() => setDeleting(undefined)}>取消</Button><Button variant="primary" size="sm" className="bg-red text-white" disabled={remove.isPending} onClick={() => remove.mutate(deleting)}>{remove.isPending ? '删除中' : '删除'}</Button></footer></div></ProductDialog> : null}
    </>
  );
}
