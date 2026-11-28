/**
 * [INPUT]: 依赖生成的模型集/受管模型 operation、TanStack Query、供应商连接名称/端点投影、产品对话框与 coss UI Card/Badge/Button/Input/InputGroup/Checkbox/Alert/Spinner。
 * [OUTPUT]: 提供模型集筛选栏创建入口、按供应商→连接→模型两层展示的模型集卡片，以及分组选择表单、成员快速移除/增删、复制和删除操作。
 * [POS]: features/models 的批量授权资源管理器；内部只保存受管模型 ID，供应商信息来自目录投影，创建入口与列表筛选保持同层。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Image as ImageIcon, Layers, Pencil, Plus, Search, Server, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createModelSet, deleteModelSet, listManagedModels, listModelSets, updateModelSet } from '@/api/generated/sdk.gen';
import type {
  EnterpriseErrorResponse,
  ManagedModel,
  ManagedModelPageData,
  ModelSet,
  ModelSetPageData,
  ModelSetWriteRequest
} from '@/api/generated/types.gen';
import { ConfirmDialog } from '@/components/product/ConfirmDialog';
import { ProductDialog } from '@/components/product/Dialog';
import { DialogFooter } from '@/components/product/DialogFooter';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardPanel } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { randomUuid } from '@/lib/crypto';
import { formatTokenCapacity } from './token-capacity';

type Notice = { error: boolean; text: string };

function message(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'error' in error) {
    const payload = (error as EnterpriseErrorResponse).error;
    if (payload?.message) {
      if (payload.code === 'ENT_RESOURCE_IN_USE' && payload.details
        && typeof payload.details === 'object'
        && 'modelGrantCount' in payload.details && 'quotaPolicyCount' in payload.details) {
        const details = payload.details;
        const references = [
          details.modelGrantCount > 0 ? '模型访问授权 ' + details.modelGrantCount + ' 条' : undefined,
          details.quotaPolicyCount > 0 ? '配额策略 ' + details.quotaPolicyCount + ' 条' : undefined
        ].filter((value): value is string => value !== undefined);
        return references.length > 0 ? payload.message + '（' + references.join('、') + '）' : payload.message;
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

function modelLabel(model: ManagedModel) {
  return model.name || model.alias || model.modelId;
}

export function filterModelSetModels(models: ReadonlyArray<ManagedModel>, query: string, provider: string) {
  const normalized = query.trim().toLowerCase();
  return models.filter((model) => {
    if (provider !== 'all' && model.providerName !== provider) return false;
    if (!normalized) return true;
    return [model.name, model.alias, model.modelId, model.providerName]
      .some((value) => value?.toLowerCase().includes(normalized));
  });
}

function membersOf(set: ModelSet, models: ReadonlyArray<ManagedModel>) {
  const byId = new Map(models.map((model) => [model.id, model]));
  return set.modelIds.map((id) => byId.get(id)).filter((model): model is ManagedModel => model !== undefined);
}

type ModelSetConnectionGroup = { connectionId: string; connectionName: string; endpoint?: string; models: ManagedModel[] };
type ModelSetProviderGroup = { providerId: string; providerName: string; connections: ModelSetConnectionGroup[] };

export function groupModelSetMembers(
  members: ReadonlyArray<ManagedModel>,
  connectionNames: ReadonlyMap<string, string>,
  connectionEndpoints?: ReadonlyMap<string, string>
) {
  const providers = new Map<string, ModelSetProviderGroup>();
  members.forEach((model) => {
    const provider = providers.get(model.providerId) ?? { providerId: model.providerId, providerName: model.providerName, connections: [] };
    let connection = provider.connections.find((item) => item.connectionId === model.connectionId);
    if (!connection) {
      connection = {
        connectionId: model.connectionId,
        connectionName: connectionNames.get(model.connectionId) ?? model.connectionId,
        endpoint: connectionEndpoints?.get(model.connectionId),
        models: []
      };
      provider.connections.push(connection);
    }
    connection.models.push(model);
    providers.set(model.providerId, provider);
  });
  return Array.from(providers.values());
}

/** 紧凑展示模型上下文容量与多模态图标，保持明显矮于外层模型胶囊。 */
function ModelContextTag({ model }: { model: ManagedModel }) {
  return (
    <span className="inline-flex h-4.5 shrink-0 items-center gap-1 rounded bg-muted/80 px-1.5 text-[10px] leading-none font-normal text-muted-foreground tabular-nums">
      <span className="font-mono">{formatTokenCapacity(model.contextWindow) || '—'}</span>
      {model.input?.includes('image') ? (
        <>
          <span>·</span>
          <span className="inline-flex items-center gap-0.5" title="支持图片输入">
            <ImageIcon aria-hidden className="size-2.5" />
            图
          </span>
        </>
      ) : null}
    </span>
  );
}

function ModelSetCard({
  set,
  models,
  connectionNames,
  connectionEndpoints,
  canWrite,
  busy,
  onEdit,
  onDuplicate,
  onRemoveModel,
  onDelete
}: {
  set: ModelSet;
  models: ReadonlyArray<ManagedModel>;
  connectionNames: ReadonlyMap<string, string>;
  connectionEndpoints: ReadonlyMap<string, string>;
  canWrite: boolean;
  busy: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemoveModel: (model: ManagedModel) => void;
  onDelete: () => void;
}) {
  const members = membersOf(set, models);
  const providerTree = groupModelSetMembers(members, connectionNames, connectionEndpoints);
  const [collapsedConnections, setCollapsedConnections] = useState<Record<string, boolean>>({});
  const [removingModel, setRemovingModel] = useState<ManagedModel>();
  const maxVisibleModels = 8;

  return (
    <>
      <Card render={<article />} className="overflow-hidden">
        <div className="border-b p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                <Layers aria-hidden className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="m-0 truncate text-sm font-semibold" title={set.name}>{set.name}</h2>
                  <Badge variant="secondary" size="sm">{set.modelCount} 个模型</Badge>
                </div>
                {set.description ? <p className="m-0 mt-1 line-clamp-1 text-xs text-muted-foreground" title={set.description}>{set.description}</p> : null}
              </div>
            </div>
            {canWrite ? (
              <div className="flex shrink-0 items-center gap-1">
                <Button type="button" variant="ghost" size="xs" aria-label={'编辑 ' + set.name} title="编辑模型集" disabled={busy} onClick={onEdit}>
                  <Pencil aria-hidden />编辑
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" aria-label={'复制 ' + set.name} title="复制模型集" disabled={busy} onClick={onDuplicate}>
                  <Copy aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" className="text-destructive-foreground" aria-label={'删除 ' + set.name} title="删除模型集" disabled={busy} onClick={onDelete}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-3 bg-muted/25 p-4">
          {providerTree.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">此模型集尚未包含任何有效受管模型</div>
          ) : providerTree.map((provider) => (
            <Card key={provider.providerId} className="overflow-hidden">
              <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
                <Badge size="sm" className="size-4 p-0 text-[9px] font-bold">{provider.providerName.slice(0, 1).toUpperCase()}</Badge>
                <span className="text-xs font-semibold">{provider.providerName}</span>
                <span className="text-[11px] text-muted-foreground">({provider.connections.length} 条连接)</span>
              </div>
              <div className="divide-y">
                {provider.connections.map((connection) => {
                  const key = provider.providerId + '\u0000' + connection.connectionId;
                  const collapsed = collapsedConnections[key] === true;
                  const hasMany = connection.models.length > maxVisibleModels;
                  const visibleModels = collapsed ? connection.models.slice(0, maxVisibleModels) : connection.models;
                  return (
                    <div key={connection.connectionId} className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                          <span className="size-1.5 shrink-0 rounded-full bg-success" />
                          <Server aria-hidden className="size-3 shrink-0" />
                          <span className="truncate font-semibold text-foreground" title={connection.connectionName}>{connection.connectionName}</span>
                          <span className="shrink-0 text-[10px] font-normal">({connection.models.length} 个模型)</span>
                          {connection.endpoint ? <span className="hidden truncate font-mono text-[10px] font-normal lg:inline" title={connection.endpoint}>{connection.endpoint}</span> : null}
                        </div>
                        {hasMany ? (
                          <Button type="button" variant="ghost" size="xs" className="h-auto px-1.5 py-0.5 text-[11px]" onClick={() => setCollapsedConnections((items) => ({ ...items, [key]: !collapsed }))}>
                            {collapsed ? '展开全部 (' + connection.models.length + ')' : '收起部分'}
                          </Button>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pl-3">
                        {visibleModels.map((model) => (
                          <Badge key={model.id} variant="outline" className="h-auto! min-h-7 gap-1.5 rounded-md py-1 pl-2.5 pr-1.5 text-xs font-medium">
                            <span className="truncate" title={modelLabel(model)}>{modelLabel(model)}</span>
                            <ModelContextTag model={model} />
                            {canWrite ? (
                              <button type="button" className="ml-0.5 text-muted-foreground transition hover:text-destructive-foreground" title="移出模型" aria-label={'从 ' + set.name + ' 移出 ' + modelLabel(model)} disabled={busy} onClick={() => setRemovingModel(model)}>
                                <X aria-hidden className="size-3" />
                              </button>
                            ) : null}
                          </Badge>
                        ))}
                        {collapsed && hasMany ? (
                          <Button type="button" variant="outline" size="xs" onClick={() => setCollapsedConnections((items) => ({ ...items, [key]: false }))}>
                            +{connection.models.length - maxVisibleModels} 更多模型
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>

        <div className="flex items-center justify-between border-t px-5 py-3 text-[11px] text-muted-foreground">
          <span>共 {set.modelCount} 个模型</span>
          {canWrite ? (
            <Button type="button" variant="ghost" size="xs" onClick={onEdit}><Plus aria-hidden />管理集合内模型</Button>
          ) : null}
        </div>
      </Card>
      {removingModel ? (
        <ConfirmDialog
          title="确认移出模型"
          description={'确定从“' + set.name + '”移出模型“' + modelLabel(removingModel) + '”？'}
          confirmLabel="移出"
          saving={busy}
          onClose={() => { if (!busy) setRemovingModel(undefined); }}
          onConfirm={() => { onRemoveModel(removingModel); setRemovingModel(undefined); }}
        />
      ) : null}
    </>
  );
}

function ModelSetEditor({
  current,
  initial,
  error,
  models,
  connectionNames,
  connectionEndpoints,
  onClose,
  onSave,
  saving
}: {
  current?: ModelSet;
  initial?: ModelSet;
  error?: string;
  models: ReadonlyArray<ManagedModel>;
  connectionNames: ReadonlyMap<string, string>;
  connectionEndpoints: ReadonlyMap<string, string>;
  onClose: () => void;
  onSave: (value: ModelSetWriteRequest) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(current?.name ?? initial?.name ?? '');
  const [description, setDescription] = useState(current?.description ?? initial?.description ?? '');
  const [modelIds, setModelIds] = useState<string[]>(current?.modelIds ?? initial?.modelIds ?? []);
  const [modelFilter, setModelFilter] = useState('');
  const visibleModels = useMemo(() => filterModelSetModels(models, modelFilter, 'all'), [models, modelFilter]);
  const providerTree = useMemo(() => groupModelSetMembers(visibleModels, connectionNames, connectionEndpoints), [connectionEndpoints, connectionNames, visibleModels]);
  const allVisibleSelected = visibleModels.length > 0 && visibleModels.every((model) => modelIds.includes(model.id));

  const toggleModel = (model: ManagedModel) => {
    const selected = modelIds.includes(model.id);
    if (model.status === 'DISABLED' && !selected) return;
    setModelIds((items) => selected ? items.filter((id) => id !== model.id) : [...items, model.id]);
  };
  const toggleModels = (groupModels: ReadonlyArray<ManagedModel>) => {
    const groupIds = new Set(groupModels.map((model) => model.id));
    const allSelected = groupModels.length > 0 && groupModels.every((model) => modelIds.includes(model.id));
    setModelIds((items) => allSelected
      ? items.filter((id) => !groupIds.has(id))
      : Array.from(new Set([...items, ...groupModels.filter((model) => model.status === 'ACTIVE').map((model) => model.id)])));
  };
  const toggleAllVisible = () => toggleModels(visibleModels);

  return (
    <ProductDialog
      className="flex max-h-[88vh] max-w-[680px] flex-col overflow-hidden"
      title={current ? '编辑模型集' : initial ? '复制模型集' : '新建模型集'}
      description="将多个受管模型归类为一个集合，方便批量配置访问权限"
      onClose={onClose}
    >
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); if (name.trim() && modelIds.length > 0) onSave({ name: name.trim(), description: description.trim(), modelIds }); }}>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6 text-xs">
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>模型集名称 <span className="text-destructive">*</span></FieldLabel>
              <Input aria-label="模型集名称" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：全员基础对话模型集" />
              {!name.trim() ? <FieldError match>请输入模型集名称</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel>描述说明 <span className="font-normal text-muted-foreground">(选填)</span></FieldLabel>
              <Input aria-label="模型集描述" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="说明该集合适用的团队或授权用途" />
            </Field>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold">选择模型 <span className="text-destructive">*</span></span>
                <span className="text-[11px] text-muted-foreground">已选 <strong className="font-semibold text-foreground">{modelIds.length}</strong> / {models.length}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" variant="ghost" size="xs" disabled={visibleModels.length === 0} onClick={toggleAllVisible}>{allVisibleSelected ? '取消全选' : '全选'}</Button>
                {modelIds.length > 0 ? <Button type="button" variant="ghost" size="xs" onClick={() => setModelIds([])}>清空</Button> : null}
              </div>
            </div>
            <InputGroup>
              <InputGroupAddon><Search aria-hidden /></InputGroupAddon>
              <InputGroupInput type="search" aria-label="搜索受管模型" value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} placeholder="搜索供应商、连接名称或模型..." />
              {modelFilter ? (
                <InputGroupAddon align="inline-end">
                  <Button type="button" variant="ghost" size="icon-xs" aria-label="清除搜索" onClick={() => setModelFilter('')}><X aria-hidden /></Button>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
            <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
              {providerTree.map((provider) => {
                const providerModels = provider.connections.flatMap((connection) => connection.models);
                const selectedCount = providerModels.filter((model) => modelIds.includes(model.id)).length;
                const providerSelected = providerModels.length > 0 && selectedCount === providerModels.length;
                return (
                  <Card key={provider.providerId} render={<section />} className="overflow-hidden">
                    <button type="button" className="flex w-full items-center justify-between border-b bg-muted/40 px-3.5 py-2.5 text-left transition hover:bg-muted/60" onClick={() => toggleModels(providerModels)}>
                      <span className="flex items-center gap-2">
                        <span className={'grid size-4 place-items-center rounded border transition ' + (providerSelected ? 'border-primary bg-primary text-primary-foreground' : selectedCount > 0 ? 'border-ring bg-muted text-foreground' : 'border-input bg-background')}>
                          {providerSelected ? <Check aria-hidden className="size-3 stroke-[3]" /> : selectedCount > 0 ? <span className="h-0.5 w-2 rounded bg-foreground" /> : null}
                        </span>
                        <Badge size="sm" className="size-4 p-0 text-[9px] font-bold">{provider.providerName.slice(0, 1).toUpperCase()}</Badge>
                        <span className="text-xs font-semibold">{provider.providerName}</span>
                        <span className="text-[11px] text-muted-foreground">({provider.connections.length} 条连接)</span>
                      </span>
                      <span className="text-[11px] text-muted-foreground">已选 {selectedCount} / {providerModels.length}</span>
                    </button>
                    <div className="divide-y">
                      {provider.connections.map((connection) => {
                        const connectionSelected = connection.models.length > 0 && connection.models.every((model) => modelIds.includes(model.id));
                        return (
                          <div key={connection.connectionId} className="space-y-2.5 p-3 pl-5">
                            <button type="button" className="group inline-flex max-w-full items-center gap-2 text-left" onClick={() => toggleModels(connection.models)}>
                              <span className={'grid size-3.5 shrink-0 place-items-center rounded border transition ' + (connectionSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background')}>
                                {connectionSelected ? <Check aria-hidden className="size-2.5 stroke-[3]" /> : null}
                              </span>
                              <Server aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate font-medium text-muted-foreground group-hover:text-foreground" title={connection.connectionName}>{connection.connectionName}</span>
                              {connection.endpoint ? <span className="hidden truncate font-mono text-[10px] text-muted-foreground sm:inline" title={connection.endpoint}>{connection.endpoint}</span> : null}
                            </button>
                            <div className="flex flex-wrap gap-2 pl-5">
                              {connection.models.map((model) => {
                                const selected = modelIds.includes(model.id);
                                const disabled = model.status === 'DISABLED' && !selected;
                                return (
                                  <button type="button" key={model.id} disabled={disabled} aria-pressed={selected} onClick={() => toggleModel(model)} className={'inline-flex min-h-8 max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ' + (selected ? 'border-ring bg-accent font-semibold text-foreground' : disabled ? 'cursor-not-allowed bg-muted/40 text-muted-foreground opacity-60' : 'bg-card text-muted-foreground hover:bg-muted/40')}>
                                    <span className={'grid size-3.5 shrink-0 place-items-center rounded border transition ' + (selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background')}>
                                      {selected ? <Check aria-hidden className="size-2.5 stroke-[3]" /> : null}
                                    </span>
                                    <span className="truncate" title={modelLabel(model)}>{modelLabel(model)}</span>
                                    <ModelContextTag model={model} />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
              {visibleModels.length === 0 ? <div className="rounded-xl border border-dashed py-8 text-center text-xs text-muted-foreground">没有匹配的受管模型</div> : null}
            </div>
          </div>
          {error ? <Alert variant="error"><AlertDescription>{error}</AlertDescription></Alert> : null}
        </div>
        <div className="flex items-center justify-between border-t bg-muted/50 px-6 py-4">
          <span className="text-xs text-muted-foreground">已选择 <strong className="font-semibold text-foreground">{modelIds.length}</strong> 个模型</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onClose}>取消</Button>
            <Button type="submit" size="sm" disabled={saving || !name.trim() || modelIds.length === 0}>{saving ? '保存中' : '保存'}</Button>
          </div>
        </div>
      </form>
    </ProductDialog>
  );
}

export function ModelSetManagement({ active = true, canWrite, connectionNames, connectionEndpoints, onCountChange }: {
  active?: boolean; canWrite: boolean; connectionNames: ReadonlyMap<string, string>; connectionEndpoints: ReadonlyMap<string, string>; onCountChange?: (count: number) => void;
}) {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<'create' | ModelSet>();
  const [duplicateSource, setDuplicateSource] = useState<ModelSet>();
  const [deleting, setDeleting] = useState<ModelSet>();
  const [notice, setNotice] = useState<Notice>();
  const [modelSetSearch, setModelSetSearch] = useState('');
  const sets = useInfiniteQuery({
    queryKey: ['models', 'sets'],
    queryFn: ({ pageParam }) => loadSets(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: 30_000
  });
  const models = useQuery({ queryKey: ['models', 'set-options'], queryFn: loadAllModels, staleTime: 30_000 });
  const rows = useMemo(() => sets.data?.pages.flatMap((page) => page.items) ?? [], [sets.data]);
  const filteredRows = useMemo(() => {
    const query = modelSetSearch.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((set) => {
      if ([set.name, set.description].some((value) => value?.toLowerCase().includes(query))) return true;
      return set.modelIds.some((modelId) => {
        const model = models.data?.find((item) => item.id === modelId);
        return model !== undefined && [model.name, model.alias, model.modelId, model.providerName, connectionNames.get(model.connectionId)]
          .some((value) => value?.toLowerCase().includes(query));
      });
    });
  }, [connectionNames, models.data, modelSetSearch, rows]);

  const save = useMutation({
    mutationFn: async ({ current, value }: { current?: ModelSet; value: ModelSetWriteRequest; successMessage?: string }) => unwrap(
      current
        ? await updateModelSet({ body: value, headers: { 'If-Match': current.revision }, path: { modelSetId: current.id } })
        : await createModelSet({ body: value, headers: { 'Idempotency-Key': randomUuid() } }),
      '模型集保存失败'
    ),
    onSuccess: async (_data, variables) => {
      setEditor(undefined);
      setDuplicateSource(undefined);
      setNotice({ error: false, text: variables.successMessage || (variables.current ? '模型集已更新' : '模型集已创建') });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['models', 'sets'] }),
        queryClient.invalidateQueries({ queryKey: ['access', 'model-sets'] })
      ]);
    },
    onError: (error) => setNotice({ error: true, text: message(error, '模型集保存失败') })
  });

  const remove = useMutation({
    mutationFn: async (set: ModelSet) => unwrap(await deleteModelSet({
      headers: { 'If-Match': set.revision },
      path: { modelSetId: set.id }
    }), '模型集删除失败'),
    onSuccess: async () => {
      setDeleting(undefined);
      setNotice({ error: false, text: '模型集已删除' });
      await queryClient.invalidateQueries({ queryKey: ['models', 'sets'] });
    },
    onError: (error) => setNotice({ error: true, text: message(error, '模型集删除失败') })
  });

  const updateMember = (set: ModelSet, model: ManagedModel) => {
    if (!canWrite || save.isPending) return;
    save.mutate({
      current: set,
      value: { name: set.name, description: set.description, modelIds: set.modelIds.filter((id) => id !== model.id) },
      successMessage: '已从模型集中移出「' + modelLabel(model) + '」'
    });
  };

  const duplicate = (set: ModelSet) => {
    if (!canWrite || save.isPending) return;
    save.reset();
    setDuplicateSource({ ...set, name: set.name + ' (副本)' });
    setEditor('create');
  };

  const openCreate = () => {
    save.reset();
    setDuplicateSource(undefined);
    setEditor('create');
  };
  const openEdit = (set: ModelSet) => {
    save.reset();
    setDuplicateSource(undefined);
    setEditor(set);
  };

  useEffect(() => {
    onCountChange?.(rows.length);
  }, [onCountChange, rows.length]);

  if (!active) return null;

  return (
    <>
      {notice ? <Alert variant={notice.error ? 'error' : 'success'}><AlertDescription>{notice.text}</AlertDescription></Alert> : null}
      <Card>
        <CardPanel className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <InputGroup className="min-w-[260px] max-w-xl flex-1">
            <InputGroupAddon><Search aria-hidden /></InputGroupAddon>
            <InputGroupInput
              size="sm"
              type="search"
              aria-label="搜索模型集名称、描述或集合内的模型名称"
              value={modelSetSearch}
              onChange={(event) => setModelSetSearch(event.target.value)}
              placeholder="搜索模型集、供应商、连接或模型名称..."
            />
            {modelSetSearch ? (
              <InputGroupAddon align="inline-end">
                <Button type="button" variant="ghost" size="icon-xs" aria-label="清除模型集搜索" onClick={() => setModelSetSearch('')}>
                  <X aria-hidden />
                </Button>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
          {canWrite ? (
            <Button type="button" size="sm" className="self-end sm:self-auto" disabled={models.isLoading || models.isError} onClick={openCreate}>
              <Plus aria-hidden />新建模型集
            </Button>
          ) : null}
        </CardPanel>
      </Card>

      {sets.error ? (
        <Alert variant="error">
          <AlertDescription>模型集加载失败：{message(sets.error, '模型集加载失败')}</AlertDescription>
          <AlertAction><Button type="button" variant="outline" size="xs" onClick={() => void sets.refetch()}>重试</Button></AlertAction>
        </Alert>
      ) : null}

      {sets.isLoading ? (
        <Card><CardPanel className="flex items-center justify-center gap-2 px-4 py-12 text-xs text-muted-foreground"><Spinner />加载模型集…</CardPanel></Card>
      ) : filteredRows.length === 0 ? (
        <Card>
          <CardPanel className="space-y-3 p-12 text-center">
            <div className="mx-auto grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground"><Layers aria-hidden className="size-5" /></div>
            <h2 className="m-0 text-sm font-semibold">{modelSetSearch ? '暂未找到匹配的模型集' : '暂无模型集'}</h2>
            <p className="mx-auto m-0 max-w-md text-xs leading-5 text-muted-foreground">{modelSetSearch ? '尝试搜索模型集名称或其中的模型。' : '创建模型集后，可以在访问策略中批量授权一组受管模型。'}</p>
          </CardPanel>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredRows.map((set) => (
            <ModelSetCard
              key={set.id}
              set={set}
              models={models.data ?? []}
              connectionNames={connectionNames}
              connectionEndpoints={connectionEndpoints}
              canWrite={canWrite}
              busy={save.isPending || remove.isPending}
              onEdit={() => openEdit(set)}
              onDuplicate={() => duplicate(set)}
              onRemoveModel={(model) => updateMember(set, model)}
              onDelete={() => { remove.reset(); setNotice(undefined); setDeleting(set); }}
            />
          ))}
        </div>
      )}

      {sets.hasNextPage ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" disabled={sets.isFetchingNextPage} onClick={() => void sets.fetchNextPage()}>
            {sets.isFetchingNextPage ? '加载中…' : '加载更多模型集'}
          </Button>
        </div>
      ) : null}

      {editor ? (
        <ModelSetEditor
          key={editor === 'create' ? duplicateSource?.id ?? 'create' : editor.id}
          current={editor === 'create' ? undefined : editor}
          initial={editor === 'create' ? duplicateSource : undefined}
          error={save.error ? message(save.error, '模型集保存失败') : undefined}
          models={models.data ?? []}
          connectionNames={connectionNames}
          connectionEndpoints={connectionEndpoints}
          saving={save.isPending}
          onClose={() => { save.reset(); setDuplicateSource(undefined); setEditor(undefined); }}
          onSave={(value) => save.mutate({ current: editor === 'create' ? undefined : editor, value })}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title="确认删除"
          description={`确定删除“${deleting.name}”？`}
          detail="如果该模型集已被访问授权或配额策略引用，需先解除关联。"
          confirmLabel="删除"
          pendingLabel="删除中"
          saving={remove.isPending}
          error={remove.error ? message(remove.error, '模型集删除失败') : undefined}
          onClose={() => { if (!remove.isPending) { remove.reset(); setDeleting(undefined); } }}
          onConfirm={() => remove.mutate(deleting)}
        />
      ) : null}
    </>
  );
}
