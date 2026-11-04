/**
 * [INPUT]: 依赖 TanStack Form、Zod、成员目录、产品对话框及生成的用户组/模型集/授权/配额 DTO。
 * [OUTPUT]: 提供模型授权、互斥 TOKEN/RATE 策略编辑器及删除确认对话框。
 * [POS]: features/access 的纯表单层；共享主体/资源外壳，但不让 Token 窗口与 RPM/并发出现在同一表单。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useForm } from '@tanstack/react-form';
import { Building2, Check, Cpu, Globe, Image as ImageIcon, Layers, Search, Server, UserCheck, Users, X } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import type {
  AccessGroup,
  ManagedModel,
  ModelGrant,
  ModelSet,
  QuotaPolicy,
  QuotaPolicyWriteRequest,
  QuotaWindow
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { Monogram, monogramColor } from '@/components/atoms/EntityChip';
import { ProductDialog } from '@/components/product/Dialog';
import { DialogFooter } from '@/components/product/DialogFooter';
import { MemberSelect } from '@/features/member-select';
import { formatTokenCapacity } from '@/features/models/token-capacity';

const inputClass = 'h-9 w-full rounded-lg border border-line bg-canvas px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-tint disabled:cursor-not-allowed disabled:opacity-55';
const requiredText = z.string().trim().min(1, '不能为空');
const optionalPositiveInteger = z.union([z.literal(''), z.string().regex(/^[1-9]\d*$/, '请输入正整数')]);

function fieldError(errors: ReadonlyArray<unknown>) {
  for (const error of errors) {
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  }
  return undefined;
}

function ErrorText({ errors }: { errors: ReadonlyArray<unknown> }) {
  const message = fieldError(errors);
  return message ? <span role="alert" className="text-[12px] text-red">{message}</span> : null;
}

function modelLabel(model: ManagedModel) {
  return `${model.providerName} / ${model.alias}${model.status === 'DISABLED' ? ' - 已停用' : ''}`;
}

export type GrantEditorValue = {
  resourceType: 'MODEL_SET' | 'MODEL';
  resourceId: string;
  subjectType: 'ALL_MEMBERS' | 'ACCESS_GROUP' | 'MEMBER';
  subjectIds: string[];
  status: 'ACTIVE' | 'DISABLED';
};

function resourceLabel(model: ManagedModel) {
  return model.name || model.alias || model.modelId;
}

export function GrantEditorDialog({ accessGroups, connections, current, error, members, modelSets, models, onClose, onSave, saving }: {
  accessGroups: ReadonlyArray<AccessGroup>;
  connections: ReadonlyMap<string, string>;
  current?: ModelGrant;
  error?: string;
  members: ReadonlyArray<{ id: string; username: string; displayName: string; status: 'ACTIVE' | 'DISABLED' }>;
  modelSets: ReadonlyArray<ModelSet>;
  models: ReadonlyArray<ManagedModel>;
  onClose: () => void;
  onSave: (value: GrantEditorValue) => void;
  saving: boolean;
}) {
  const [resourceType, setResourceType] = useState<GrantEditorValue['resourceType']>(current?.resourceType ?? 'MODEL_SET');
  const [resourceId, setResourceId] = useState(current?.resourceId ?? '');
  const [subjectType, setSubjectType] = useState<GrantEditorValue['subjectType']>(current?.subjectType ?? 'ALL_MEMBERS');
  const [subjectIds, setSubjectIds] = useState<string[]>(current?.subjectId ? [current.subjectId] : []);
  const [status, setStatus] = useState<GrantEditorValue['status']>(current?.status ?? 'ACTIVE');
  const [resourceSearch, setResourceSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const query = resourceSearch.trim().toLowerCase();
  const targetQuery = targetSearch.trim().toLowerCase();
  const visibleSets = modelSets.filter((set) => !query || set.name.toLowerCase().includes(query) || (set.description ?? '').toLowerCase().includes(query));
  const visibleModels = models.filter((model) => !query || [model.providerName, model.alias, model.modelId, model.name].some((value) => value?.toLowerCase().includes(query)));
  const visibleGroups = accessGroups.filter((group) => !targetQuery || group.name.toLowerCase().includes(targetQuery));
  const visibleMembers = members.filter((member) => !targetQuery || [member.displayName, member.username].some((value) => value.toLowerCase().includes(targetQuery)));
  const toggleSubject = (id: string) => setSubjectIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const canSave = Boolean(resourceId && (subjectType === 'ALL_MEMBERS' || subjectIds.length > 0));
  const providerGroups = visibleModels.reduce<Array<{ provider: string; modelsByConnection: Map<string, ManagedModel[]> }>>((groups, model) => {
    let group = groups.find((item) => item.provider === model.providerName);
    if (!group) { group = { provider: model.providerName, modelsByConnection: new Map() }; groups.push(group); }
    const connectionModels = group.modelsByConnection.get(model.connectionId) ?? [];
    connectionModels.push(model);
    group.modelsByConnection.set(model.connectionId, connectionModels);
    return groups;
  }, []);

  return <ProductDialog className="flex max-w-[640px] flex-col overflow-hidden rounded-2xl" title={current ? '编辑模型授权' : '新建模型授权'} description="选择「模型集」或「单个模型」资源，并配置允许访问的成员范围" onClose={onClose}>
    <form className="grid min-h-0 gap-0 bg-surface" onSubmit={(event) => { event.preventDefault(); if (canSave) onSave({ resourceType, resourceId, subjectType, subjectIds, status }); }}>
      <div className="sr-only">
        <select aria-label="资源类型" value={resourceType} onChange={(event) => { setResourceType(event.target.value as GrantEditorValue['resourceType']); setResourceId(''); }}><option value="MODEL_SET">模型集</option><option value="MODEL">单个模型</option></select>
        <select aria-label="资源" value={resourceId} onChange={(event) => setResourceId(event.target.value)}><option value="">选择资源</option>{modelSets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}{models.map((model) => <option key={model.id} value={model.id} disabled={model.status === 'DISABLED'}>{modelLabel(model)}</option>)}</select>
        <select aria-label="授权对象" value={subjectType} onChange={(event) => { setSubjectType(event.target.value as GrantEditorValue['subjectType']); setSubjectIds([]); }}><option value="ALL_MEMBERS">所有成员</option><option value="ACCESS_GROUP">指定用户组</option><option value="MEMBER">指定成员</option></select>
        {subjectType === 'ACCESS_GROUP' ? <select aria-label="用户组" value={subjectIds[0] ?? ''} onChange={(event) => setSubjectIds(event.target.value ? [event.target.value] : [])}><option value="">选择用户组</option>{accessGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select> : null}
        {subjectType === 'MEMBER' ? <select aria-label="成员" value={subjectIds[0] ?? ''} onChange={(event) => setSubjectIds(event.target.value ? [event.target.value] : [])}><option value="">选择成员</option>{members.map((member) => <option key={member.id} value={member.id} disabled={member.status === 'DISABLED'}>{member.displayName} ({member.username})</option>)}</select> : null}
      </div>
      <div className="min-h-0 max-h-[calc(100dvh-220px)] space-y-5 overflow-y-auto px-6 py-5 text-xs">
        <section className="space-y-2">
          <label className="block font-semibold text-ink-2">资源类型 <span className="text-red">*</span></label>
          <div className="grid grid-cols-2 gap-3">
            {([{ value: 'MODEL_SET', label: '模型集', description: '按打包好的模型集合批量授权', icon: Layers }, { value: 'MODEL', label: '单个模型', description: '精确选择指定连接下的单个模型', icon: Cpu }] as const).map((item) => { const Icon = item.icon; const selected = resourceType === item.value; return <button key={item.value} type="button" onClick={() => { setResourceType(item.value); setResourceId(''); setResourceSearch(''); }} className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${selected ? 'border-accent bg-accent-tint ring-2 ring-accent/15' : 'border-line bg-field/60 text-ink-2 hover:bg-hover'}`}><span className="flex min-w-0 items-center gap-2.5"><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${selected ? 'bg-accent text-white' : 'border border-line bg-surface text-ink-3'}`}><Icon aria-hidden className="size-4" /></span><span className="min-w-0"><strong className="block text-xs text-ink">{item.label}</strong><small className="mt-0.5 block truncate text-[11px] text-ink-3">{item.description}</small></span></span><span className={`grid size-4 shrink-0 place-items-center rounded-full border ${selected ? 'border-accent bg-accent text-white' : 'border-line-strong bg-surface text-transparent'}`}><Check aria-hidden className="size-2.5" /></span></button>; })}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between"><label className="font-semibold text-ink-2">选择{resourceType === 'MODEL_SET' ? '模型集' : '单个模型'}资源 <span className="text-red">*</span></label><span className="text-[11px] text-ink-3">{resourceType === 'MODEL_SET' ? `共 ${modelSets.length} 个可选模型集` : `按「供应商 → 连接通道」分组，共 ${models.length} 个模型`}</span></div>
          <label className="relative block"><Search aria-hidden className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-ink-3" /><input autoFocus aria-label="搜索授权资源" className={`${inputClass} bg-field/60 pl-8 pr-8`} value={resourceSearch} onChange={(event) => setResourceSearch(event.target.value)} placeholder={resourceType === 'MODEL_SET' ? '搜索模型集名称或描述...' : '搜索供应商、连接通道或模型名称...'} />{resourceSearch ? <button type="button" aria-label="清除资源搜索" className="absolute right-2.5 top-2 text-ink-3 hover:text-ink" onClick={() => setResourceSearch('')}><X aria-hidden className="size-3.5" /></button> : null}</label>
          {resourceType === 'MODEL_SET' ? <div className="grid max-h-48 gap-2 overflow-y-auto pr-1">{visibleSets.map((set) => { const selected = resourceId === set.id; return <button key={set.id} type="button" onClick={() => setResourceId(set.id)} className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${selected ? 'border-accent bg-accent-tint ring-1 ring-accent/15' : 'border-line bg-surface hover:bg-hover'}`}><span className="min-w-0"><span className="flex items-center gap-2"><strong className="truncate text-xs text-ink">{set.name}</strong><span className="shrink-0 rounded-full border border-line bg-field px-1.5 py-0.5 text-[10px] text-ink-2">{set.modelCount} 个模型</span></span><span className="mt-0.5 block truncate text-[11px] text-ink-3">{set.description || '未填写描述'}</span></span><span className={`grid size-4 shrink-0 place-items-center rounded-full border ${selected ? 'border-accent bg-accent text-white' : 'border-line-strong text-transparent'}`}><Check aria-hidden className="size-2.5" /></span></button>; })}</div> : <div className="max-h-52 space-y-2.5 overflow-y-auto pr-1">{providerGroups.map((provider) => <div key={provider.provider} className="overflow-hidden rounded-xl border border-line bg-surface"><div className="flex items-center gap-2 border-b border-line bg-field/70 px-3 py-1.5"><span className="grid size-4 place-items-center rounded bg-ink text-[9px] font-bold text-white">{provider.provider.slice(0, 1).toUpperCase()}</span><span className="text-xs font-semibold text-ink">{provider.provider}</span></div>{Array.from(provider.modelsByConnection.entries()).map(([connectionId, connectionModels]) => <div key={connectionId} className="space-y-2 border-b border-line p-2.5 pl-3.5 last:border-b-0"><div className="flex items-center gap-1.5 text-[11px] text-ink-2"><Server aria-hidden className="size-3 text-ink-3" /><span className="font-medium">{connections.get(connectionId) ?? '未命名连接'}</span></div><div className="flex flex-wrap gap-1.5 pl-4">{connectionModels.map((model) => { const selected = resourceId === model.id; const hasVision = model.input?.some((value) => value.toLowerCase().includes('image')); return <button key={model.id} type="button" disabled={model.status === 'DISABLED'} onClick={() => setResourceId(model.id)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-accent bg-accent-tint font-semibold text-accent-ink' : 'border-line bg-field/70 text-ink-2 hover:bg-hover'}`}><span className={`grid size-3 place-items-center rounded-full border ${selected ? 'border-accent bg-accent text-white' : 'border-line-strong bg-surface'}`}>{selected ? <Check aria-hidden className="size-2" /> : null}</span><span>{resourceLabel(model)}</span><span className="inline-flex items-center gap-1 rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-ink-3">{formatTokenCapacity(model.contextWindow) || '—'}{hasVision ? <><span>·</span><ImageIcon aria-hidden className="size-2.5 text-accent" /><span>图</span></> : null}</span></button>; })}</div></div>)}</div>)}</div>}
          {((resourceType === 'MODEL_SET' ? visibleSets.length : visibleModels.length) === 0) ? <p className="m-0 rounded-xl border border-dashed border-line py-8 text-center text-xs text-ink-3">没有匹配的资源</p> : null}
        </section>

        <section className="space-y-3 border-t border-line pt-5">
          <div className="flex items-center justify-between"><label className="font-semibold text-ink-2">授权对象 <span className="text-red">*</span></label><span className="text-[11px] text-ink-3">决定哪些用户可调用上述模型资源</span></div>
          <div className="grid grid-cols-3 gap-2.5">
            {([{ value: 'ALL_MEMBERS', label: '所有成员', description: '全员默认可用', icon: Globe }, { value: 'ACCESS_GROUP', label: '指定用户组', description: '按部门/团队赋权', icon: Building2 }, { value: 'MEMBER', label: '指定成员', description: '按个人账号赋权', icon: UserCheck }] as const).map((item) => { const Icon = item.icon; const selected = subjectType === item.value; return <button key={item.value} type="button" onClick={() => { setSubjectType(item.value); setSubjectIds([]); setTargetSearch(''); }} className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition ${selected ? 'border-ink bg-ink text-white shadow-sm' : 'border-line bg-field/60 text-ink-2 hover:bg-hover'}`}><span className={`grid size-7 shrink-0 place-items-center rounded-lg ${selected ? 'bg-white/15 text-white' : 'border border-line bg-surface text-ink-3'}`}><Icon aria-hidden className="size-3.5" /></span><span className="min-w-0"><strong className="block truncate text-xs">{item.label}</strong><small className={`mt-0.5 block truncate text-[10px] ${selected ? 'text-white/70' : 'text-ink-3'}`}>{item.description}</small></span></button>; })}
          </div>
          {subjectType === 'ALL_MEMBERS' ? <div className="flex items-center gap-3 rounded-xl border border-green bg-green-tint p-3.5 text-green"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-green-tint"><Globe aria-hidden className="size-4" /></span><span><strong className="block text-xs">对企业内所有成员开放访问</strong><span className="mt-0.5 block text-[11px] opacity-80">工作空间内的全部现有及新加入成员均可直接调用该资源。</span></span></div> : <div className="space-y-2.5 rounded-xl border border-line bg-field/70 p-3.5"><div className="flex items-center justify-between gap-3"><label className="relative min-w-0 flex-1"><Search aria-hidden className="pointer-events-none absolute left-2.5 top-2 size-3 text-ink-3" /><input aria-label="搜索授权对象" className="h-8 w-full rounded-lg border border-line bg-surface pl-7 pr-7 text-xs text-ink outline-none focus:border-line-strong" value={targetSearch} onChange={(event) => setTargetSearch(event.target.value)} placeholder={subjectType === 'ACCESS_GROUP' ? '搜索用户组...' : '搜索成员姓名、邮箱或部门...'} />{targetSearch ? <button type="button" aria-label="清除对象搜索" className="absolute right-2 top-1.5 text-ink-3" onClick={() => setTargetSearch('')}><X aria-hidden className="size-3.5" /></button> : null}</label><span className="shrink-0 text-[11px] text-ink-3">已选 <strong className="text-ink">{subjectIds.length}</strong> 个</span></div><div className="grid max-h-40 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{subjectType === 'ACCESS_GROUP' ? visibleGroups.map((group) => { const checked = subjectIds.includes(group.id); return <button key={group.id} type="button" onClick={() => toggleSubject(group.id)} className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 text-left transition ${checked ? 'border-accent bg-surface ring-1 ring-accent/15' : 'border-line bg-surface/70 hover:bg-surface'}`}><span className="flex min-w-0 items-center gap-2"><Building2 aria-hidden className={`size-3.5 shrink-0 ${checked ? 'text-accent' : 'text-ink-3'}`} /><span className="min-w-0"><strong className="block truncate text-xs text-ink">{group.name}</strong><span className="block text-[10px] text-ink-3">{group.memberCount} 人</span></span></span><span className={`grid size-4 shrink-0 place-items-center rounded border ${checked ? 'border-accent bg-accent text-white' : 'border-line-strong text-transparent'}`}><Check aria-hidden className="size-2.5" /></span></button>; }) : visibleMembers.map((member) => { const checked = subjectIds.includes(member.id); return <button key={member.id} type="button" disabled={member.status === 'DISABLED'} onClick={() => toggleSubject(member.id)} className={`flex items-center justify-between gap-2 rounded-lg border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'border-accent bg-surface ring-1 ring-accent/15' : 'border-line bg-surface/70 hover:bg-surface'}`}><span className="flex min-w-0 items-center gap-2"><Monogram color={monogramColor(member.displayName)} className="size-6 text-[10px]">{member.displayName.slice(0, 1)}</Monogram><span className="min-w-0"><strong className="block truncate text-xs text-ink">{member.displayName}</strong><span className="block truncate font-mono text-[10px] text-ink-3">{member.username}</span></span></span><span className={`grid size-4 shrink-0 place-items-center rounded border ${checked ? 'border-accent bg-accent text-white' : 'border-line-strong text-transparent'}`}><Check aria-hidden className="size-2.5" /></span></button>; })}</div><div className="flex items-center justify-between text-[11px] text-ink-3"><span>{subjectIds.length > 0 ? `已选择 ${subjectIds.length} 个${subjectType === 'ACCESS_GROUP' ? '用户组' : '成员'}` : '至少选择 1 个授权对象'}</span>{subjectIds.length > 0 ? <button type="button" className="font-medium text-accent hover:text-accent-ink" onClick={() => setSubjectIds([])}>清空已选</button> : null}</div></div>}
        </section>

        <div className="pt-4"><section className="flex items-center justify-between rounded-xl border border-line bg-field/70 p-3.5"><div><strong className="block text-xs text-ink">策略启用状态</strong><span className="mt-0.5 block text-[11px] text-ink-3">保存后立即生效；若停用则暂时冻结该授权规则</span></div><div className="flex items-center gap-2.5"><span className={`text-xs font-medium ${status === 'ACTIVE' ? 'text-green' : 'text-ink-3'}`}>{status === 'ACTIVE' ? '启用' : '停用'}</span><button type="button" role="switch" aria-checked={status === 'ACTIVE'} onClick={() => setStatus((value) => value === 'ACTIVE' ? 'DISABLED' : 'ACTIVE')} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition ${status === 'ACTIVE' ? 'bg-ink' : 'bg-line-strong'}`}><span className={`pointer-events-none size-5 rounded-full bg-white shadow-sm transition ${status === 'ACTIVE' ? 'translate-x-5' : 'translate-x-0'} `} /></button></div></section></div>
        {error ? <p role="alert" className="m-0 rounded-lg bg-red-tint px-3 py-2 text-xs text-red">{error}</p> : null}
      </div>
      <DialogFooter className="mx-0 border-line bg-field px-6"><Button type="button" size="sm" className="rounded-full border border-line bg-surface px-4" onClick={onClose}>取消</Button><Button type="submit" variant="primary" size="sm" className="rounded-full px-5" disabled={!canSave || saving}>{saving ? '保存中' : '保存'}</Button></DialogFooter>
    </form>
  </ProductDialog>;
}
type QuotaFormValue = {
  name: string;
  policyType: 'TOKEN' | 'RATE';
  subjectType: 'ORGANIZATION' | 'MEMBER';
  subjectId: string;
  resourceType: 'ALL_MODELS' | 'MODEL_SET' | 'MODEL';
  resourceId: string;
  fiveHourTokenLimit: string;
  dailyTokenLimit: string;
  weeklyTokenLimit: string;
  monthlyTokenLimit: string;
  rpm: string;
  concurrency: string;
  status: 'ACTIVE' | 'DISABLED';
};

const TOKEN_WINDOWS = [
  { field: 'fiveHourTokenLimit', type: 'FIVE_HOURS', label: '5 小时' },
  { field: 'dailyTokenLimit', type: 'DAY', label: '每日' },
  { field: 'weeklyTokenLimit', type: 'WEEK', label: '每周' },
  { field: 'monthlyTokenLimit', type: 'MONTH', label: '每月' }
] as const;

function nullableInteger(value: string) {
  return value === '' ? null : Number(value);
}

function tokenLabel(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function resetLabel(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function WindowUsage({ value }: { value?: QuotaWindow }) {
  if (!value) return <span className="text-[11.5px] text-ink-3">暂无用量</span>;
  const percent = Math.min(100, value.limit === 0 ? 0 : value.usedTokens / value.limit * 100);
  return (
    <div className="grid gap-1">
      <div className="flex justify-between gap-3 text-[11.5px] tabular-nums text-ink-2"><span>{tokenLabel(value.usedTokens)} / {tokenLabel(value.limit)}</span><span className="text-ink-3">{resetLabel(value.resetsAt)} 重置</span></div>
      <div className="h-1 overflow-hidden rounded-full bg-line"><div className={percent >= 100 ? 'h-full bg-red' : percent >= 80 ? 'h-full bg-amber-500' : 'h-full bg-green'} style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

export function QuotaEditorDialog({ current, error, modelSets, models, onClose, onSave, policyType, saving, windows, windowsLoading }: {
  current?: QuotaPolicy;
  error?: string;
  modelSets: ReadonlyArray<ModelSet>;
  models: ReadonlyArray<ManagedModel>;
  onClose: () => void;
  onSave: (value: QuotaPolicyWriteRequest) => void;
  policyType: 'TOKEN' | 'RATE';
  saving: boolean;
  windows: ReadonlyArray<QuotaWindow>;
  windowsLoading: boolean;
}) {
  const type = current?.policyType ?? policyType;
  const form = useForm({
    defaultValues: {
      name: current?.name ?? '',
      policyType: type,
      subjectType: current?.subjectType ?? 'MEMBER',
      subjectId: current?.subjectId ?? '',
      resourceType: current?.resourceType ?? 'ALL_MODELS',
      resourceId: current?.resourceId ?? '',
      fiveHourTokenLimit: current?.fiveHourTokenLimit?.toString() ?? '',
      dailyTokenLimit: current?.dailyTokenLimit?.toString() ?? '',
      weeklyTokenLimit: current?.weeklyTokenLimit?.toString() ?? '',
      monthlyTokenLimit: current?.monthlyTokenLimit?.toString() ?? '',
      rpm: current?.rpm?.toString() ?? '',
      concurrency: current?.concurrency?.toString() ?? '',
      status: current?.status ?? 'ACTIVE'
    } satisfies QuotaFormValue,
    onSubmit: ({ value }) => onSave({
      name: value.name.trim(),
      policyType: value.policyType,
      subjectType: value.subjectType,
      subjectId: value.subjectType === 'ORGANIZATION' ? null : value.subjectId,
      resourceType: value.resourceType,
      resourceId: value.resourceType === 'ALL_MODELS' ? null : value.resourceId,
      fiveHourTokenLimit: type === 'TOKEN' ? nullableInteger(value.fiveHourTokenLimit) : null,
      dailyTokenLimit: type === 'TOKEN' ? nullableInteger(value.dailyTokenLimit) : null,
      weeklyTokenLimit: type === 'TOKEN' ? nullableInteger(value.weeklyTokenLimit) : null,
      monthlyTokenLimit: type === 'TOKEN' ? nullableInteger(value.monthlyTokenLimit) : null,
      rpm: type === 'RATE' ? nullableInteger(value.rpm) : null,
      concurrency: type === 'RATE' ? nullableInteger(value.concurrency) : null,
      status: value.status
    })
  });

  return (
    <ProductDialog className="max-w-[760px]" title={`${current ? '编辑' : '新建'}${type === 'TOKEN' ? ' Token 配额' : '速率限制'}`} onClose={onClose}>
      <form className="grid gap-5 p-5" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(); }}>
        <section className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
            <form.Field name="name" validators={{ onSubmit: requiredText }}>{(field) => <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">策略名称<input autoFocus className={inputClass} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} /><ErrorText errors={field.state.meta.errors} /></label>}</form.Field>
            <form.Field name="status">{(field) => <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">状态<select className={inputClass} value={field.state.value} onChange={(event) => field.handleChange(event.target.value as QuotaFormValue['status'])}><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select></label>}</form.Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="subjectType">{(field) => <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">适用对象<select className={inputClass} value={field.state.value} onChange={(event) => { field.handleChange(event.target.value as QuotaFormValue['subjectType']); form.setFieldValue('subjectId', ''); }}><option value="ORGANIZATION">整个组织</option><option value="MEMBER">指定成员</option></select></label>}</form.Field>
            <form.Subscribe selector={(state) => state.values.subjectType}>{(subjectType) => subjectType === 'MEMBER' ? <form.Field name="subjectId" validators={{ onSubmit: requiredText }}>{(field) => <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">成员<MemberSelect className={inputClass} value={field.state.value} onBlur={field.handleBlur} onValueChange={field.handleChange} /><ErrorText errors={field.state.meta.errors} /></label>}</form.Field> : <div />}</form.Subscribe>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="resourceType">{(field) => <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">资源范围<select className={inputClass} value={field.state.value} onChange={(event) => { field.handleChange(event.target.value as QuotaFormValue['resourceType']); form.setFieldValue('resourceId', ''); }}><option value="ALL_MODELS">全部模型</option><option value="MODEL_SET">模型集</option><option value="MODEL">单个模型</option></select></label>}</form.Field>
            <form.Subscribe selector={(state) => state.values.resourceType}>{(resourceType) => resourceType === 'ALL_MODELS' ? <div /> : <form.Field name="resourceId" validators={{ onSubmit: requiredText }}>{(field) => <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">{resourceType === 'MODEL_SET' ? '模型集' : '模型'}<select className={inputClass} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)}><option value="">选择资源</option>{resourceType === 'MODEL_SET' ? modelSets.map((set) => <option key={set.id} value={set.id}>{set.name} ({set.modelCount})</option>) : models.map((model) => <option key={model.id} value={model.id} disabled={model.status === 'DISABLED'}>{modelLabel(model)}</option>)}</select><ErrorText errors={field.state.meta.errors} /></label>}</form.Field>}</form.Subscribe>
          </div>
        </section>

        {type === 'TOKEN' ? <fieldset className="grid gap-0 overflow-hidden rounded-lg border border-line p-0">
          <legend className="mx-3 px-1 text-[12.5px] font-semibold text-ink">Token 额度</legend>
          {TOKEN_WINDOWS.map((item) => {
            const usage = windows.find((window) => window.windowType === item.type);
            return (
              <form.Field key={item.field} name={item.field} validators={{ onSubmit: optionalPositiveInteger }}>
                {(field) => {
                  const enabled = field.state.value !== '';
                  return (
                    <div className="grid gap-2 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[95px_180px_minmax(220px,1fr)] sm:items-center">
                      <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2"><input type="checkbox" checked={enabled} onChange={(event) => field.handleChange(event.target.checked ? '1' : '')} />{item.label}</label>
                      <div className="grid gap-1"><input aria-label={`${item.label} Token 额度`} type="number" min="1" step="1" placeholder="无限制" className={inputClass} disabled={!enabled} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} /><ErrorText errors={field.state.meta.errors} /></div>
                      {windowsLoading ? <span className="text-[11.5px] text-ink-3">正在读取用量...</span> : <WindowUsage value={usage} />}
                    </div>
                  );
                }}
              </form.Field>
            );
          })}
        </fieldset> : null}

        {type === 'RATE' ? <fieldset className="grid gap-3 rounded-lg border border-line p-4">
          <legend className="px-1 text-[12.5px] font-semibold text-ink">请求约束</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ['rpm', '每分钟请求（RPM）'],
              ['concurrency', '并发请求']
            ] as const).map(([name, label]) => (
              <form.Field key={name} name={name} validators={{ onSubmit: optionalPositiveInteger }}>
                {(field) => {
                  const enabled = field.state.value !== '';
                  return <div className="grid gap-1.5"><label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2"><input type="checkbox" checked={enabled} onChange={(event) => field.handleChange(event.target.checked ? '1' : '')} />{label}</label><input aria-label={label} type="number" min="1" step="1" placeholder="无限制" className={inputClass} disabled={!enabled} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} /><ErrorText errors={field.state.meta.errors} /></div>;
                }}
              </form.Field>
            ))}
          </div>
        </fieldset> : null}

        {error ? <p role="alert" className="m-0 rounded-md bg-red-tint px-3 py-2 text-[12.5px] text-red">{error}</p> : null}
        <DialogFooter><Button type="button" size="sm" onClick={onClose}>取消</Button><form.Subscribe selector={(state) => state.canSubmit}>{(canSubmit) => <Button type="submit" variant="primary" size="sm" disabled={!canSubmit || saving}>{saving ? '保存中' : '保存'}</Button>}</form.Subscribe></DialogFooter>
      </form>
    </ProductDialog>
  );
}

export function DeletePolicyDialog({ error, kind, label, onClose, onConfirm, saving }: {
  error?: string;
  kind: 'grant' | 'quota';
  label: string;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  return (
    <ProductDialog title="确认删除" onClose={onClose}>
      <div className="space-y-5 p-5">
        <p className="m-0 text-[13px] leading-6 text-ink-2">确定删除“{label}”？该操作会立即影响后续模型请求。</p>
        {kind === 'quota' ? <p className="m-0 text-[12px] leading-5 text-ink-3">已有使用窗口记录的配额策略不能删除，请改为停用。</p> : null}
        {error ? <p role="alert" className="m-0 rounded-md bg-red-tint px-3 py-2 text-[12.5px] text-red">{error}</p> : null}
        <DialogFooter><Button type="button" size="sm" disabled={saving} onClick={onClose}>取消</Button><Button type="button" variant="primary" size="sm" className="bg-red text-white hover:brightness-95" disabled={saving} onClick={onConfirm}>{saving ? '删除中' : '删除'}</Button></DialogFooter>
      </div>
    </ProductDialog>
  );
}
