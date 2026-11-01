/**
 * [INPUT]: 依赖生成的模型集/受管模型 operation、TanStack Query、供应商连接名称/端点投影、产品对话框与模型集专用筛选状态。
 * [OUTPUT]: 提供按供应商→连接→模型两层展示的模型集卡片，以及与原型一致的分组选择表单、成员快速移除/增删、复制和删除操作。
 * [POS]: features/models 的批量授权资源管理器；内部只保存受管模型 ID，供应商信息来自目录投影。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Image as ImageIcon, Layers, Pencil, Plus, Search, Server, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createModelSet, deleteModelSet, listManagedModels, listModelSets, updateModelSet } from '@/api/generated/sdk.gen';
import type {
  EnterpriseErrorResponse,
  ManagedModel,
  ManagedModelPageData,
  ModelSet,
  ModelSetPageData,
  ModelSetWriteRequest
} from '@/api/generated/types.gen';
import { randomUuid } from '@/lib/crypto';
import { Button } from '@/components/atoms/Button';
import { ProductDialog } from '@/components/product/Dialog';
import { DialogFooter } from '@/components/product/DialogFooter';
import { formatTokenCapacity } from './token-capacity';

const inputClass = 'h-9 w-full rounded-lg border border-line bg-canvas px-3 text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint';

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
  const maxVisibleModels = 8;

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_1px_2px_rgba(0,0,0,.03)] transition hover:border-zinc-300">
      <div className="border-b border-zinc-100 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-zinc-900 text-white shadow-sm"><Layers aria-hidden className="size-4" /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="m-0 truncate text-sm font-semibold text-zinc-900" title={set.name}>{set.name}</h2>
                <span className="inline-flex items-center rounded-full border border-zinc-200/80 bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">{set.modelCount} 个模型</span>
              </div>
              {set.description ? <p className="m-0 mt-1 line-clamp-1 text-xs text-zinc-500" title={set.description}>{set.description}</p> : null}
            </div>
          </div>
          {canWrite ? <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="quiet" size="xs" className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900" aria-label={'编辑 ' + set.name} title="编辑模型集" disabled={busy} onClick={onEdit}><Pencil aria-hidden className="size-3.5 text-zinc-400" />编辑</Button>
            <Button type="button" variant="quiet" size="xs" className="size-7 rounded-lg p-0 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label={'复制 ' + set.name} title="复制模型集" disabled={busy} onClick={onDuplicate}><Copy aria-hidden className="size-3.5" /></Button>
            <Button type="button" variant="quiet" size="xs" className="size-7 rounded-lg p-0 text-zinc-400 hover:bg-rose-50 hover:text-rose-600" aria-label={'删除 ' + set.name} title="删除模型集" disabled={busy} onClick={onDelete}><Trash2 aria-hidden className="size-3.5" /></Button>
          </div> : null}
        </div>
      </div>

      <div className="space-y-3 bg-zinc-50/50 p-4">
        {providerTree.length === 0 ? <div className="py-6 text-center text-xs text-zinc-400">此模型集尚未包含任何有效受管模型</div> : providerTree.map((provider) => (
          <div key={provider.providerId} className="overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-[0_1px_2px_rgba(0,0,0,.02)]">
            <div className="flex items-center gap-2 border-b border-zinc-200/60 bg-zinc-100/80 px-3 py-2">
              <span className="grid size-4 shrink-0 place-items-center rounded bg-zinc-800 text-[9px] font-bold text-white">{provider.providerName.slice(0, 1).toUpperCase()}</span>
              <span className="text-xs font-semibold text-zinc-900">{provider.providerName}</span>
              <span className="text-[11px] text-zinc-400">({provider.connections.length} 条连接)</span>
            </div>
            <div className="divide-y divide-zinc-100">
              {provider.connections.map((connection) => {
                const key = provider.providerId + '\u0000' + connection.connectionId;
                const collapsed = collapsedConnections[key] === true;
                const hasMany = connection.models.length > maxVisibleModels;
                const visibleModels = collapsed ? connection.models.slice(0, maxVisibleModels) : connection.models;
                return <div key={connection.connectionId} className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-zinc-600">
                      <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <Server aria-hidden className="size-3 shrink-0 text-zinc-400" />
                      <span className="truncate font-semibold text-zinc-700" title={connection.connectionName}>{connection.connectionName}</span>
                      <span className="shrink-0 text-[10px] font-normal text-zinc-400">({connection.models.length} 个模型)</span>
                      {connection.endpoint ? <span className="hidden truncate font-mono text-[10px] font-normal text-zinc-400 lg:inline" title={connection.endpoint}>{connection.endpoint}</span> : null}
                    </div>
                    {hasMany ? <button type="button" className="shrink-0 text-[11px] text-zinc-400 transition hover:text-zinc-700" onClick={() => setCollapsedConnections((items) => ({ ...items, [key]: !collapsed }))}>{collapsed ? '展开全部 (' + connection.models.length + ')' : '收起部分'}</button> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pl-3">
                    {visibleModels.map((model) => <span key={model.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-zinc-200/80 bg-zinc-100/80 py-1 pl-2.5 pr-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-200/60">
                      <span className="truncate" title={modelLabel(model)}>{modelLabel(model)}</span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-200/60 bg-white/90 px-1.5 py-0.5 text-[10px] font-normal text-zinc-400">
                        <span className="font-mono">{formatTokenCapacity(model.contextWindow) || '—'}</span>
                        {model.input?.includes('image') ? <><span className="text-zinc-300">·</span><span className="inline-flex items-center gap-0.5 font-medium text-purple-600" title="支持图片输入"><ImageIcon aria-hidden className="size-2.5" />图</span></> : null}
                      </span>
                      {canWrite ? <button type="button" className="ml-0.5 text-zinc-400 transition hover:text-rose-600" title="移出模型" aria-label={'从 ' + set.name + ' 移出 ' + modelLabel(model)} disabled={busy} onClick={() => onRemoveModel(model)}><X aria-hidden className="size-3" /></button> : null}
                    </span>)}
                    {collapsed && hasMany ? <button type="button" className="inline-flex items-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800" onClick={() => setCollapsedConnections((items) => ({ ...items, [key]: false }))}>+{connection.models.length - maxVisibleModels} 更多模型</button> : null}
                  </div>
                </div>;
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-zinc-100 bg-white px-5 py-3 text-[11px] text-zinc-400">
        <span>共 {set.modelCount} 个模型</span>
        {canWrite ? <button type="button" className="inline-flex items-center gap-1 font-medium text-zinc-600 hover:text-zinc-900" onClick={onEdit}><Plus aria-hidden className="size-3" />管理集合内模型</button> : null}
      </div>
    </article>
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
      className="flex max-h-[88vh] max-w-[680px] flex-col overflow-hidden rounded-2xl border-zinc-200/90"
      title={current ? '编辑模型集' : initial ? '复制模型集' : '新建模型集'}
      description="将多个受管模型归类为一个集合，方便批量配置访问权限"
      onClose={onClose}
    >
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); if (name.trim() && modelIds.length > 0) onSave({ name: name.trim(), description: description.trim(), modelIds }); }}>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-white p-6 text-xs">
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-[12px] font-semibold text-zinc-800">
              <span className="flex h-5 items-center">模型集名称 <span className="text-rose-500">*</span></span>
              <input aria-label="模型集名称" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：全员基础对话模型集" className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50/70 px-3 text-xs font-medium text-zinc-900 outline-none transition focus:border-zinc-900 focus:bg-white" />
              {!name.trim() ? <span role="alert" className="font-normal text-rose-600">请输入模型集名称</span> : null}
            </label>
            <label className="grid gap-1.5 text-[12px] font-semibold text-zinc-800">
              <span className="flex h-5 items-center">描述说明 <span className="font-normal text-zinc-400">(选填)</span></span>
              <input aria-label="模型集描述" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="说明该集合适用的团队或授权用途" className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50/70 px-3 text-xs text-zinc-900 outline-none transition focus:border-zinc-900 focus:bg-white" />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-zinc-800">选择模型 <span className="text-rose-500">*</span></span>
                <span className="text-[11px] text-zinc-500">已选 <strong className="font-semibold text-zinc-900">{modelIds.length}</strong> / {models.length}</span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button type="button" className="text-[11px] font-medium text-blue-600 hover:text-blue-700" disabled={visibleModels.length === 0} onClick={toggleAllVisible}>{allVisibleSelected ? '取消全选' : '全选全部'}</button>
                {modelIds.length > 0 ? <button type="button" className="text-[11px] text-zinc-400 hover:text-zinc-700" onClick={() => setModelIds([])}>清空</button> : null}
              </div>
            </div>
            <label className="relative block">
              <span className="sr-only">搜索受管模型</span>
              <Search aria-hidden className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-zinc-400" />
              <input type="search" aria-label="搜索受管模型" value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} placeholder="搜索供应商、连接名称或模型..." className="h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50/80 pl-8 pr-8 text-xs text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white" />
              {modelFilter ? <button type="button" aria-label="清除搜索" className="absolute right-2.5 top-2 text-zinc-400 hover:text-zinc-600" onClick={() => setModelFilter('')}><X aria-hidden className="size-3.5" /></button> : null}
            </label>
            <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
              {providerTree.map((provider) => {
                const providerModels = provider.connections.flatMap((connection) => connection.models);
                const selectedCount = providerModels.filter((model) => modelIds.includes(model.id)).length;
                const providerSelected = providerModels.length > 0 && selectedCount === providerModels.length;
                return <section key={provider.providerId} className="overflow-hidden rounded-xl border border-zinc-200/90 bg-white">
                  <button type="button" className="flex w-full items-center justify-between border-b border-zinc-200/70 bg-zinc-50 px-3.5 py-2.5 text-left transition hover:bg-zinc-100/70" onClick={() => toggleModels(providerModels)}>
                    <span className="flex items-center gap-2">
                      <span className={'grid size-4 place-items-center rounded border transition ' + (providerSelected ? 'border-zinc-900 bg-zinc-900 text-white' : selectedCount > 0 ? 'border-zinc-400 bg-zinc-200 text-zinc-800' : 'border-zinc-300 bg-white')}>
                        {providerSelected ? <Check aria-hidden className="size-3 stroke-[3]" /> : selectedCount > 0 ? <span className="h-0.5 w-2 rounded bg-zinc-800" /> : null}
                      </span>
                      <span className="grid size-4 place-items-center rounded bg-zinc-800 text-[9px] font-bold text-white">{provider.providerName.slice(0, 1).toUpperCase()}</span>
                      <span className="text-xs font-semibold text-zinc-900">{provider.providerName}</span>
                      <span className="text-[11px] text-zinc-400">({provider.connections.length} 条连接)</span>
                    </span>
                    <span className="text-[11px] text-zinc-500">已选 {selectedCount} / {providerModels.length}</span>
                  </button>
                  <div className="divide-y divide-zinc-100">
                    {provider.connections.map((connection) => {
                      const connectionSelected = connection.models.length > 0 && connection.models.every((model) => modelIds.includes(model.id));
                      return <div key={connection.connectionId} className="space-y-2.5 bg-white p-3 pl-5">
                        <button type="button" className="group inline-flex max-w-full items-center gap-2 text-left" onClick={() => toggleModels(connection.models)}>
                          <span className={'grid size-3.5 shrink-0 place-items-center rounded border transition ' + (connectionSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-300 bg-white group-hover:border-zinc-400')}>{connectionSelected ? <Check aria-hidden className="size-2.5 stroke-[3]" /> : null}</span>
                          <Server aria-hidden className="size-3.5 shrink-0 text-zinc-400" />
                          <span className="truncate font-medium text-zinc-700 group-hover:text-zinc-900" title={connection.connectionName}>{connection.connectionName}</span>
                          {connection.endpoint ? <span className="hidden truncate font-mono text-[10px] text-zinc-400 sm:inline" title={connection.endpoint}>{connection.endpoint}</span> : null}
                        </button>
                        <div className="flex flex-wrap gap-2 pl-5">
                          {connection.models.map((model) => {
                            const selected = modelIds.includes(model.id);
                            const disabled = model.status === 'DISABLED' && !selected;
                            return <button type="button" key={model.id} disabled={disabled} aria-pressed={selected} onClick={() => toggleModel(model)} className={'inline-flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ' + (selected ? 'border-blue-600 bg-blue-50/70 font-semibold text-blue-950 shadow-[0_1px_2px_rgba(0,0,0,.04)]' : disabled ? 'cursor-not-allowed border-zinc-200/70 bg-zinc-100/70 text-zinc-400 opacity-60' : 'border-zinc-200/90 bg-zinc-50/70 text-zinc-700 hover:bg-zinc-100/80')}>
                              <span className={'grid size-3.5 shrink-0 place-items-center rounded border transition ' + (selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-300 bg-white')}>{selected ? <Check aria-hidden className="size-2.5 stroke-[3]" /> : null}</span>
                              <span className="truncate" title={modelLabel(model)}>{modelLabel(model)}</span>
                              <span className={'inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-normal ' + (selected ? 'border-blue-200/80 bg-white/90 text-blue-800' : 'border-zinc-200/70 bg-white text-zinc-400')}>
                                <span className="font-mono">{formatTokenCapacity(model.contextWindow) || '—'}</span>
                                {model.input?.includes('image') ? <><span className="text-zinc-300">·</span><span className="inline-flex items-center gap-0.5 font-medium text-purple-600" title="支持图片输入"><ImageIcon aria-hidden className="size-2.5" />图</span></> : null}
                              </span>
                            </button>;
                          })}
                        </div>
                      </div>;
                    })}
                  </div>
                </section>;
              })}
              {visibleModels.length === 0 ? <div className="rounded-xl border border-dashed border-zinc-200 py-8 text-center text-xs text-zinc-400">没有匹配的受管模型</div> : null}
            </div>
          </div>
          {error ? <p role="alert" className="m-0 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{error}</p> : null}
        </div>
        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/70 px-6 py-4">
          <span className="text-xs text-zinc-500">已选择 <strong className="font-semibold text-zinc-900">{modelIds.length}</strong> 个模型</span>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" className="border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100" disabled={saving} onClick={onClose}>取消</Button>
            <Button type="submit" variant="primary" size="sm" className="bg-zinc-900 text-white hover:bg-zinc-800" disabled={saving || !name.trim() || modelIds.length === 0}>{saving ? '保存中' : '保存'}</Button>
          </div>
        </div>
      </form>
    </ProductDialog>
  );
}

export function ModelSetManagement({ active = true, canWrite, connectionNames, connectionEndpoints, createRequest = 0, onCountChange }: { active?: boolean; canWrite: boolean; connectionNames: ReadonlyMap<string, string>; connectionEndpoints: ReadonlyMap<string, string>; createRequest?: number; onCountChange?: (count: number) => void }) {
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
  const lastCreateRequest = useRef(createRequest);
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

  useEffect(() => {
    if (createRequest !== lastCreateRequest.current) {
      lastCreateRequest.current = createRequest;
      openCreate();
    }
  }, [createRequest]);

  if (!active) return null;

  return (
    <>
      {notice ? <div role={notice.error ? 'alert' : 'status'} className={'rounded-lg border px-3 py-2 text-[12.5px] ' + (notice.error ? 'border-rose-200/70 bg-rose-50 text-rose-700' : 'border-emerald-200/70 bg-emerald-50 text-emerald-700')}>{notice.text}</div> : null}
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200/90 bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,.03)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          <label className="relative min-w-[260px] max-w-xl flex-1">
            <span className="sr-only">搜索模型集名称、描述或集合内的模型名称</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-zinc-400" />
            <input type="search" value={modelSetSearch} onChange={(event) => setModelSetSearch(event.target.value)} placeholder="搜索模型集、供应商、连接或模型名称..." className={inputClass + ' bg-zinc-50/50 pl-8 pr-8 placeholder:text-zinc-400'} />
            {modelSetSearch ? <button type="button" aria-label="清除模型集搜索" className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600" onClick={() => setModelSetSearch('')}><X aria-hidden className="size-3.5" /></button> : null}
          </label>
        </div>
        <div className="text-xs text-zinc-400">共 <strong className="font-semibold text-zinc-700">{filteredRows.length}</strong> 个模型集</div>
      </div>

      {sets.error ? <div role="alert" className="rounded-xl border border-rose-200/70 bg-rose-50 px-4 py-3 text-xs text-rose-700">模型集加载失败：{message(sets.error, '模型集加载失败')}<Button type="button" variant="quiet" size="xs" className="ml-2 underline" onClick={() => void sets.refetch()}>重试</Button></div> : null}
      {sets.isLoading ? <div className="rounded-2xl border border-zinc-200/90 bg-white px-4 py-12 text-center text-xs text-zinc-400">加载模型集…</div> : filteredRows.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-zinc-200/90 bg-white p-12 text-center shadow-[0_1px_2px_rgba(0,0,0,.02)]">
          <div className="mx-auto grid size-10 place-items-center rounded-xl bg-zinc-100 text-zinc-500"><Layers aria-hidden className="size-5" /></div>
          <h2 className="m-0 text-sm font-semibold text-zinc-900">{modelSetSearch ? '暂未找到匹配的模型集' : '暂无模型集'}</h2>
          <p className="mx-auto m-0 max-w-md text-xs leading-5 text-zinc-500">{modelSetSearch ? '尝试搜索模型集名称或其中的模型。' : '创建模型集后，可以在访问策略中批量授权一组受管模型。'}</p>
          {canWrite && !modelSetSearch ? <Button type="button" variant="primary" size="sm" className="bg-zinc-900 text-white hover:bg-zinc-800" disabled={models.isLoading || models.isError} onClick={openCreate}><Plus aria-hidden className="size-3.5" />新建模型集</Button> : null}
        </div>
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
      {sets.hasNextPage ? <div className="flex justify-center"><Button type="button" variant="quiet" size="sm" disabled={sets.isFetchingNextPage} onClick={() => void sets.fetchNextPage()}>{sets.isFetchingNextPage ? '加载中…' : '加载更多模型集'}</Button></div> : null}

      {editor ? <ModelSetEditor key={editor === 'create' ? duplicateSource?.id ?? 'create' : editor.id} current={editor === 'create' ? undefined : editor} initial={editor === 'create' ? duplicateSource : undefined} error={save.error ? message(save.error, '模型集保存失败') : undefined} models={models.data ?? []} connectionNames={connectionNames} connectionEndpoints={connectionEndpoints} saving={save.isPending} onClose={() => { save.reset(); setDuplicateSource(undefined); setEditor(undefined); }} onSave={(value) => save.mutate({ current: editor === 'create' ? undefined : editor, value })} /> : null}
      {deleting ? <ProductDialog title="确认删除" onClose={() => { if (!remove.isPending) { remove.reset(); setDeleting(undefined); } }}><div className="grid gap-5 p-5"><p className="m-0 text-[13px] text-ink-2">确定删除“{deleting.name}”？</p><p className="m-0 text-[12px] leading-5 text-ink-3">如果该模型集已被访问授权或配额策略引用，需先解除关联。</p>{remove.error ? <p role="alert" className="m-0 rounded-md bg-red-tint px-3 py-2 text-[12.5px] text-red">{message(remove.error, '模型集删除失败')}</p> : null}<DialogFooter><Button type="button" size="sm" disabled={remove.isPending} onClick={() => { remove.reset(); setDeleting(undefined); }}>取消</Button><Button type="button" variant="primary" size="sm" className="bg-red text-white" disabled={remove.isPending} onClick={() => remove.mutate(deleting)}>{remove.isPending ? '删除中' : '删除'}</Button></DialogFooter></div></ProductDialog> : null}
    </>
  );
}
