/**
 * [INPUT]: 依赖 TanStack Form、Zod、成员目录、产品对话框及生成的用户组/模型集/授权/配额 DTO。
 * [OUTPUT]: 提供模型授权、互斥 TOKEN/RATE 策略编辑器（配额编辑器对齐原型三态卡片/搜索多选网格/供应商-连接分组模型胶囊/页脚周期计数）、删除确认对话框与 compactTokens/可读额度工具。
 * [POS]: features/access 的纯表单层；共享主体/资源外壳，但不让 Token 窗口与 RPM/并发出现在同一表单。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useForm } from '@tanstack/react-form';
import { Building2, Check, Cpu, Globe, Image as ImageIcon, Layers, Search, Server, Sparkles, UserCheck, Users, X } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import type {
  AccessGroup,
  ManagedModel,
  ModelGrant,
  ModelSet,
  QuotaPolicy,
  QuotaPolicyWriteRequest,
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

type SubjectKind = 'ALL_MEMBERS' | 'ACCESS_GROUP' | 'MEMBER';
type ResourceKind = 'ALL_MODELS' | 'MODEL_SET' | 'MODEL';

/** 授权与配额共用的主体选择器：三态卡片（全员→用户组→成员）+ 全员提示 / 搜索多选网格。 */
function SubjectPicker({ label, hint, subjectType, subjectIds, onTypeChange, onIdsChange, accessGroups, members, allTitle, allDescription }: {
  label: string;
  hint: string;
  subjectType: SubjectKind;
  subjectIds: string[];
  onTypeChange: (type: SubjectKind) => void;
  onIdsChange: (ids: string[]) => void;
  accessGroups: ReadonlyArray<AccessGroup>;
  members: ReadonlyArray<{ id: string; username: string; displayName: string; status: 'ACTIVE' | 'DISABLED' }>;
  allTitle: string;
  allDescription: string;
}) {
  const [targetSearch, setTargetSearch] = useState('');
  const [subjectExpanded, setSubjectExpanded] = useState(false);
  const targetQuery = targetSearch.trim().toLowerCase();
  const visibleGroups = accessGroups.filter((group) => !targetQuery || group.name.toLowerCase().includes(targetQuery));
  const visibleMembers = members.filter((member) => !targetQuery || [member.displayName, member.username].some((value) => value.toLowerCase().includes(targetQuery)));
  const toggle = (id: string) => onIdsChange(subjectIds.includes(id) ? subjectIds.filter((item) => item !== id) : [...subjectIds, id]);
  // 已选胶囊卡片：按选择顺序渲染，超过 3 个折叠为 +N
  const selectedCards = subjectIds.map((id) => {
    if (subjectType === 'ACCESS_GROUP') {
      const group = accessGroups.find((candidate) => candidate.id === id);
      return group ? { id, name: group.name, avatar: <Building2 aria-hidden className="size-3.5 text-ink-3" /> } : { id, name: id, avatar: null };
    }
    const member = members.find((candidate) => candidate.id === id);
    return member ? { id, name: member.displayName, avatar: <Monogram color={monogramColor(member.displayName)} className="size-4 text-[9px]">{member.displayName.slice(0, 1)}</Monogram> } : { id, name: id, avatar: null };
  });
  return <section className="space-y-3 border-t border-line pt-5">
    <div className="flex items-center justify-between"><label className="font-semibold text-ink-2">{label} <span className="text-red">*</span></label><span className="text-[11px] text-ink-3">{hint}</span></div>
    <div className="grid grid-cols-3 gap-2.5">
      {([{ value: 'ALL_MEMBERS', label: '所有成员', description: '全员统一默认', icon: Globe }, { value: 'ACCESS_GROUP', label: '指定用户组', description: '按部门/团队选择', icon: Building2 }, { value: 'MEMBER', label: '指定成员', description: '按个人账号选择', icon: UserCheck }] as const).map((item) => { const Icon = item.icon; const selected = subjectType === item.value; return <button key={item.value} type="button" onClick={() => { onTypeChange(item.value); onIdsChange([]); setTargetSearch(''); }} className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition ${selected ? 'border-transparent bg-ink text-canvas shadow-md' : 'border-line bg-field/60 text-ink-2 hover:bg-hover'}`}><span className={`grid size-7 shrink-0 place-items-center rounded-lg ${selected ? 'bg-canvas/15 text-canvas' : 'border border-line bg-surface text-ink-3'}`}><Icon aria-hidden className="size-3.5" /></span><span className="min-w-0"><strong className="block truncate text-xs">{item.label}</strong><small className={`mt-0.5 block truncate text-[10px] ${selected ? 'text-canvas/70' : 'text-ink-3'}`}>{item.description}</small></span></button>; })}
    </div>
    {subjectType === 'ALL_MEMBERS' ? <div className="flex items-center gap-3 rounded-xl border border-green bg-green-tint p-3.5 text-green"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-green-tint"><Globe aria-hidden className="size-4" /></span><span><strong className="block text-xs">{allTitle}</strong><span className="mt-0.5 block text-[11px] opacity-80">{allDescription}</span></span></div> : <div className="space-y-2.5 rounded-xl border border-line bg-field/70 p-3.5">
      {subjectIds.length > 0 ? <div className="flex flex-wrap gap-1.5">
        {(subjectExpanded ? selectedCards : selectedCards.slice(0, 3)).map((card) => <span key={card.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-1 pr-2 text-xs text-ink">{card.avatar}<span className="max-w-40 truncate">{card.name}</span><button type="button" aria-label={`移除 ${card.name}`} className="grid size-4 place-items-center rounded-full text-ink-3 transition hover:bg-red-tint hover:text-red" onClick={() => toggle(card.id)}><X aria-hidden className="size-3" /></button></span>)}
        {!subjectExpanded && selectedCards.length > 3 ? <button type="button" className="inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-ink-2 transition hover:bg-hover" onClick={() => setSubjectExpanded(true)}>+{selectedCards.length - 3}</button> : null}
        {subjectExpanded && selectedCards.length > 3 ? <button type="button" className="inline-flex items-center rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-ink-2 transition hover:bg-hover" onClick={() => setSubjectExpanded(false)}>收起</button> : null}
      </div> : null}
      <div className="flex items-center justify-between gap-3">
        <label className="relative min-w-0 flex-1"><Search aria-hidden className="pointer-events-none absolute left-2.5 top-2 size-3 text-ink-3" /><input aria-label={`搜索${label}`} className="h-8 w-full rounded-lg border border-line bg-surface pl-7 pr-7 text-xs text-ink outline-none focus:border-line-strong" value={targetSearch} onChange={(event) => setTargetSearch(event.target.value)} placeholder={subjectType === 'ACCESS_GROUP' ? '搜索用户组...' : '搜索成员姓名或账号...'} />{targetSearch ? <button type="button" aria-label="清除对象搜索" className="absolute right-2 top-1.5 text-ink-3" onClick={() => setTargetSearch('')}><X aria-hidden className="size-3.5" /></button> : null}</label>
        <span className="shrink-0 text-[11px] text-ink-3">已选 <strong className="text-ink">{subjectIds.length}</strong> 个</span>
      </div>
      <div className="grid max-h-40 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {subjectType === 'ACCESS_GROUP'
          ? visibleGroups.map((group) => { const checked = subjectIds.includes(group.id); return <button key={group.id} type="button" onClick={() => toggle(group.id)} className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 text-left transition ${'border-transparent bg-surface/60 hover:bg-field'}`}><span className="flex min-w-0 items-center gap-2"><Building2 aria-hidden className={`size-3.5 shrink-0 text-ink-3`} /><span className="min-w-0"><strong className="block truncate text-xs text-ink">{group.name}</strong><span className="block text-[10px] text-ink-3">{group.memberCount} 人</span></span></span><span className={`grid size-4 shrink-0 place-items-center rounded border ${checked ? 'border-ink bg-ink text-canvas' : 'border-line-strong text-transparent'}`}><Check aria-hidden className="size-2.5" /></span></button>; })
          : visibleMembers.map((member) => { const checked = subjectIds.includes(member.id); return <button key={member.id} type="button" disabled={member.status === 'DISABLED'} onClick={() => toggle(member.id)} className={`flex items-center justify-between gap-2 rounded-lg border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${'border-transparent bg-surface/60 hover:bg-field'}`}><span className="flex min-w-0 items-center gap-2"><Monogram color={monogramColor(member.displayName)} className="size-6 text-[10px]">{member.displayName.slice(0, 1)}</Monogram><span className="min-w-0"><strong className="block truncate text-xs text-ink">{member.displayName}</strong><span className="block truncate font-mono text-[10px] text-ink-3">{member.username}</span></span></span><span className={`grid size-4 shrink-0 place-items-center rounded border ${checked ? 'border-ink bg-ink text-canvas' : 'border-line-strong text-transparent'}`}><Check aria-hidden className="size-2.5" /></span></button>; })}
      </div>
      <div className="flex items-center justify-between text-[11px] text-ink-3"><span>{subjectIds.length > 0 ? `已选择 ${subjectIds.length} 个${subjectType === 'ACCESS_GROUP' ? '用户组' : '成员'}` : `至少选择 1 个${subjectType === 'ACCESS_GROUP' ? '用户组' : '成员'}`}</span>{subjectIds.length > 0 ? <button type="button" className="font-medium text-accent hover:text-accent-ink" onClick={() => onIdsChange([])}>清空已选</button> : null}</div>
    </div>}
  </section>;
}

/** 授权与配额共用的模型资源选择器：类型卡片 + 搜索 + 模型集列表 / 供应商→连接分组模型胶囊；配额额外提供"全部模型"。 */
function ResourcePicker({ label, hint, resourceType, resourceId, onTypeChange, onIdChange, modelSets, models, connections, includeAllModels }: {
  label: string;
  hint: string;
  resourceType: ResourceKind;
  resourceId: string;
  onTypeChange: (type: ResourceKind) => void;
  onIdChange: (id: string) => void;
  modelSets: ReadonlyArray<ModelSet>;
  models: ReadonlyArray<ManagedModel>;
  connections: ReadonlyMap<string, string>;
  includeAllModels: boolean;
}) {
  const [resourceSearch, setResourceSearch] = useState('');
  const query = resourceSearch.trim().toLowerCase();
  const visibleSets = modelSets.filter((set) => !query || set.name.toLowerCase().includes(query) || (set.description ?? '').toLowerCase().includes(query));
  const visibleModels = models.filter((model) => !query || [model.providerName, model.alias, model.modelId, model.name].some((value) => value?.toLowerCase().includes(query)));
  const providerGroups = visibleModels.reduce<Array<{ provider: string; modelsByConnection: Map<string, ManagedModel[]> }>>((groups, model) => {
    let group = groups.find((item) => item.provider === model.providerName);
    if (!group) { group = { provider: model.providerName, modelsByConnection: new Map() }; groups.push(group); }
    const connectionModels = group.modelsByConnection.get(model.connectionId) ?? [];
    connectionModels.push(model);
    group.modelsByConnection.set(model.connectionId, connectionModels);
    return groups;
  }, []);
  const kinds: ReadonlyArray<{ value: ResourceKind; label: string; description: string; icon: typeof Layers }> = includeAllModels
    ? [{ value: 'ALL_MODELS', label: '全部模型', description: '所有受管模型合计', icon: Sparkles }, { value: 'MODEL_SET', label: '指定模型集', description: '按模型集合计额度', icon: Layers }, { value: 'MODEL', label: '单个模型', description: '精确选择某一模型', icon: Cpu }]
    : [{ value: 'MODEL_SET', label: '模型集', description: '按打包好的模型集合批量选择', icon: Layers }, { value: 'MODEL', label: '单个模型', description: '精确选择指定连接下的单个模型', icon: Cpu }];
  const suggest = (kind: ResourceKind) => kind === 'MODEL_SET' ? modelSets[0]?.id ?? '' : kind === 'MODEL' ? models[0]?.id ?? '' : '';
  return <section className="space-y-2 border-t border-line pt-5">
    <div className="flex items-center justify-between"><label className="font-semibold text-ink-2">{label} <span className="text-red">*</span></label><span className="text-[11px] text-ink-3">{hint}</span></div>
    <div className={`grid gap-2.5 ${includeAllModels ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
      {kinds.map((item) => { const Icon = item.icon; const selected = resourceType === item.value; return <button key={item.value} type="button" onClick={() => { onTypeChange(item.value); onIdChange(suggest(item.value)); setResourceSearch(''); }} className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition ${selected ? 'border-transparent bg-ink text-canvas shadow-md' : 'border-line bg-field/60 text-ink-2 hover:bg-hover'}`}><span className={`grid size-7 shrink-0 place-items-center rounded-lg ${selected ? 'bg-canvas/15 text-canvas' : 'border border-line bg-surface text-ink-3'}`}><Icon aria-hidden className="size-3.5" /></span><span className="min-w-0"><strong className={`block truncate text-xs ${selected ? 'text-canvas' : 'text-ink'}`}>{item.label}</strong><small className={`mt-0.5 block truncate text-[10px] ${selected ? 'text-canvas/70' : 'text-ink-3'}`}>{item.description}</small></span></button>; })}
    </div>
    {resourceType === 'ALL_MODELS' ? null : <>
      <label className="relative block"><Search aria-hidden className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-ink-3" /><input aria-label="搜索资源" className={`${inputClass} bg-field/60 pl-8 pr-8`} value={resourceSearch} onChange={(event) => setResourceSearch(event.target.value)} placeholder={resourceType === 'MODEL_SET' ? '搜索模型集名称或描述...' : '搜索供应商、连接通道或模型名称...'} />{resourceSearch ? <button type="button" aria-label="清除资源搜索" className="absolute right-2.5 top-2 text-ink-3 hover:text-ink" onClick={() => setResourceSearch('')}><X aria-hidden className="size-3.5" /></button> : null}</label>
      {resourceType === 'MODEL_SET' ? <div className="max-h-44 space-y-2 overflow-y-auto rounded-xl border border-line bg-field/70 p-2.5">{visibleSets.map((set) => { const selected = resourceId === set.id; return <button key={set.id} type="button" onClick={() => onIdChange(set.id)} className={`flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left transition ${selected ? 'border-ink-3 bg-surface shadow-sm' : 'border-transparent bg-surface/60 hover:bg-field'}`}><span className="flex min-w-0 flex-wrap items-center gap-2"><Layers aria-hidden className={`size-3.5 shrink-0 text-ink-3`} /><strong className="truncate text-xs text-ink">{set.name}</strong><span className="shrink-0 rounded border border-line bg-field px-1.5 py-0.5 text-[10px] text-ink-3">{set.modelCount} 个模型</span></span><span className={`grid size-4 shrink-0 place-items-center rounded-full border ${selected ? 'border-ink bg-ink text-canvas' : 'border-line-strong text-transparent'}`}><Check aria-hidden className="size-2.5" /></span></button>; })}</div> : <div className="max-h-52 space-y-2.5 overflow-y-auto pr-1">{providerGroups.map((provider) => <div key={provider.provider} className="overflow-hidden rounded-xl border border-line bg-surface"><div className="flex items-center gap-2 border-b border-line bg-field/70 px-3 py-1.5"><span className="grid size-4 place-items-center rounded bg-ink text-[9px] font-bold text-canvas">{provider.provider.slice(0, 1).toUpperCase()}</span><span className="text-xs font-semibold text-ink">{provider.provider}</span></div>{Array.from(provider.modelsByConnection.entries()).map(([connectionId, connectionModels]) => <div key={connectionId} className="space-y-2 border-b border-line p-2.5 pl-3.5 last:border-b-0"><div className="flex items-center gap-1.5 text-[11px] text-ink-2"><Server aria-hidden className="size-3 text-ink-3" /><span className="font-medium">{connections.get(connectionId) ?? '未命名连接'}</span></div><div className="flex flex-wrap gap-1.5 pl-4">{connectionModels.map((model) => { const selected = resourceId === model.id; const hasVision = model.input?.some((value) => value.toLowerCase().includes('image')); return <button key={model.id} type="button" disabled={model.status === 'DISABLED'} onClick={() => onIdChange(model.id)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-transparent bg-field/70 font-semibold text-ink' : 'border-transparent bg-field/70 text-ink-2 hover:bg-field'}`}><span className={`grid size-3 place-items-center rounded-full border ${selected ? 'border-ink bg-ink text-canvas' : 'border-line-strong bg-surface'}`}>{selected ? <Check aria-hidden className="size-2" /> : null}</span><span>{resourceLabel(model)}</span><span className="inline-flex items-center gap-1 rounded border border-line bg-surface px-1 py-0.5 text-[10px] text-ink-3">{formatTokenCapacity(model.contextWindow) || '—'}{hasVision ? <><span>·</span><ImageIcon aria-hidden className="size-2.5 text-ink-3" /><span>图</span></> : null}</span></button>; })}</div></div>)}</div>)}</div>}
      {(resourceType === 'MODEL_SET' ? visibleSets.length : visibleModels.length) === 0 ? <p className="m-0 rounded-xl border border-dashed border-line py-8 text-center text-xs text-ink-3">没有匹配的资源</p> : null}
    </>}
  </section>;
}

/** 授权与配额共用的状态开关卡片：状态灯 + 动态说明 + 圆润开关。 */
function StatusToggle({ value, onChange, activeHint, inactiveHint }: {
  value: 'ACTIVE' | 'DISABLED';
  onChange: (value: 'ACTIVE' | 'DISABLED') => void;
  activeHint: string;
  inactiveHint: string;
}) {
  return <section className="flex items-center justify-between gap-4 rounded-xl border border-line bg-field/70 p-3.5">
    <div className="flex min-w-0 items-center gap-3"><span className={`size-2.5 shrink-0 rounded-full ${value === 'ACTIVE' ? 'bg-green ring-4 ring-green/15' : 'bg-ink-3'}`} /><div className="min-w-0"><strong className="block text-xs text-ink">状态：{value === 'ACTIVE' ? '启用' : '停用'}</strong><span className="mt-0.5 block text-[11px] leading-relaxed text-ink-3">{value === 'ACTIVE' ? activeHint : inactiveHint}</span></div></div>
    <button type="button" role="switch" aria-checked={value === 'ACTIVE'} onClick={() => onChange(value === 'ACTIVE' ? 'DISABLED' : 'ACTIVE')} className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition ${value === 'ACTIVE' ? 'bg-ink' : 'bg-line-strong'}`}><span className={`pointer-events-none size-5 rounded-full bg-canvas shadow-sm transition ${value === 'ACTIVE' ? 'translate-x-5' : 'translate-x-0'}`} /></button>
  </section>;
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
  const [subjectIds, setSubjectIds] = useState<string[]>(current?.subjects.map((subject) => subject.subjectId) ?? []);
  const [status, setStatus] = useState<GrantEditorValue['status']>(current?.status ?? 'ACTIVE');
  const canSave = Boolean(resourceId && (subjectType === 'ALL_MEMBERS' || subjectIds.length > 0));

  return <ProductDialog className="flex max-w-[640px] flex-col overflow-hidden rounded-2xl" title={current ? '编辑模型授权' : '新建模型授权'} description="选择「模型集」或「单个模型」资源，并配置允许访问的成员范围" onClose={onClose}>
    <form className="flex min-h-0 flex-1 flex-col bg-surface" onSubmit={(event) => { event.preventDefault(); if (canSave) onSave({ resourceType, resourceId, subjectType, subjectIds, status }); }}>
      <div className="sr-only">
        <select aria-label="资源类型" value={resourceType} onChange={(event) => { setResourceType(event.target.value as GrantEditorValue['resourceType']); setResourceId(''); }}><option value="MODEL_SET">模型集</option><option value="MODEL">单个模型</option></select>
        <select aria-label="资源" value={resourceId} onChange={(event) => setResourceId(event.target.value)}><option value="">选择资源</option>{modelSets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}{models.map((model) => <option key={model.id} value={model.id} disabled={model.status === 'DISABLED'}>{modelLabel(model)}</option>)}</select>
        <select aria-label="授权对象" value={subjectType} onChange={(event) => { setSubjectType(event.target.value as GrantEditorValue['subjectType']); setSubjectIds([]); }}><option value="ALL_MEMBERS">所有成员</option><option value="ACCESS_GROUP">指定用户组</option><option value="MEMBER">指定成员</option></select>
        {subjectType === 'ACCESS_GROUP' ? <select aria-label="用户组" value={subjectIds[0] ?? ''} onChange={(event) => setSubjectIds(event.target.value ? [event.target.value] : [])}><option value="">选择用户组</option>{accessGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select> : null}
        {subjectType === 'MEMBER' ? <select aria-label="成员" value={subjectIds[0] ?? ''} onChange={(event) => setSubjectIds(event.target.value ? [event.target.value] : [])}><option value="">选择成员</option>{members.map((member) => <option key={member.id} value={member.id} disabled={member.status === 'DISABLED'}>{member.displayName} ({member.username})</option>)}</select> : null}
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 text-xs">
        <SubjectPicker label="授权对象" hint="决定哪些用户可调用模型资源" subjectType={subjectType} subjectIds={subjectIds} onTypeChange={(type) => setSubjectType(type)} onIdsChange={setSubjectIds} accessGroups={accessGroups} members={members} allTitle="对企业内所有成员开放访问" allDescription="工作空间内的全部现有及新加入成员均可直接调用该资源。" />

        <ResourcePicker label="资源类型与范围" hint="选择要授权的模型资源" resourceType={resourceType} resourceId={resourceId} onTypeChange={(type) => setResourceType(type as GrantEditorValue['resourceType'])} onIdChange={setResourceId} modelSets={modelSets} models={models} connections={connections} includeAllModels={false} />

        <StatusToggle value={status} onChange={setStatus} activeHint="保存后该授权立即对所选对象生效" inactiveHint="当前处于停用状态，仅保存规则但不开放访问权限" />

        {error ? <p role="alert" className="m-0 rounded-lg bg-red-tint px-3 py-2 text-xs text-red">{error}</p> : null}
      </div>
      <DialogFooter className="shrink-0 border-line bg-field px-6"><Button type="button" size="sm" className="rounded-full border border-line bg-surface px-4" onClick={onClose}>取消</Button><Button type="submit" variant="primary" size="sm" className="rounded-full px-5" disabled={!canSave || saving}>{saving ? '保存中' : '保存'}</Button></DialogFooter>
    </form>
  </ProductDialog>;
}
type QuotaFormValue = {
  name: string;
  policyType: 'TOKEN' | 'RATE';
  subjectType: 'ALL_MEMBERS' | 'ACCESS_GROUP' | 'MEMBER';
  subjectIds: string[];
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
  { field: 'fiveHourTokenLimit', type: 'FIVE_HOURS', label: '5 小时', hint: '滚动 5 小时窗口', initial: '2000000' },
  { field: 'dailyTokenLimit', type: 'DAY', label: '每日', hint: '单日累计上限', initial: '10000000' },
  { field: 'weeklyTokenLimit', type: 'WEEK', label: '每周', hint: '自然周累计上限', initial: '50000000' },
  { field: 'monthlyTokenLimit', type: 'MONTH', label: '每月', hint: '自然月累计上限', initial: '200000000' }
] as const;

const TOKEN_PRESETS = [
  { label: '500K', value: '500000' },
  { label: '2M', value: '2000000' },
  { label: '10M', value: '10000000' },
  { label: '50M', value: '50000000' },
  { label: '200M', value: '200000000' }
] as const;

/** 任意输入（含千分位）解析为非负整数；空/非法返回 0。 */
function parseTokens(value: string) {
  const digits = value.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

/** Token 数量压缩为 K/M/B 可读文本，供表单徽章与列表胶囊共用。 */
export function compactTokens(value: number | null | undefined) {
  if (value == null) return '0';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(value % 1_000_000_000 === 0 ? 0 : 1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function nullableInteger(value: string) {
  return value === '' ? null : Number(value);
}


export function QuotaEditorDialog({ accessGroups, connections, current, error, members, modelSets, models, onClose, onSave, policyType, saving }: {
  accessGroups: ReadonlyArray<AccessGroup>;
  connections: ReadonlyMap<string, string>;
  current?: QuotaPolicy;
  error?: string;
  modelSets: ReadonlyArray<ModelSet>;
  members: ReadonlyArray<{ id: string; username: string; displayName: string; status: 'ACTIVE' | 'DISABLED' }>;
  models: ReadonlyArray<ManagedModel>;
  onClose: () => void;
  onSave: (value: QuotaPolicyWriteRequest) => void;
  policyType: 'TOKEN' | 'RATE';
  saving: boolean;
}) {
  const type = current?.policyType ?? policyType;
  const form = useForm({
    defaultValues: {
      name: current?.name ?? '',
      policyType: type,
      subjectType: current?.subjectType ?? 'ALL_MEMBERS',
      subjectIds: current?.subjects.map((subject) => subject.subjectId) ?? [],
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
      subjectIds: value.subjectType === 'ALL_MEMBERS' ? [] : value.subjectIds,
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
  const subjectValidator = (kind: string) => ({ value }: { value: string[] }) => value.length > 0 ? undefined : `至少选择 1 ${kind}`;

  return (
    <ProductDialog className="flex max-w-[700px] flex-col overflow-hidden rounded-2xl" title={`${current ? '编辑' : '新建'}${type === 'TOKEN' ? ' Token 配额' : '速率限制'}`} description={type === 'TOKEN' ? '为指定成员、用户组或全员设定不同时间窗口的 Token 消耗上限' : '为指定成员、用户组或全员设定每分钟请求与并发上限'} onClose={onClose}>
      <form className="flex min-h-0 flex-1 flex-col bg-surface" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(); }}>
        <div className="sr-only">
          <form.Field name="subjectType">{(field) => <select aria-label="适用对象" value={field.state.value} onChange={(event) => { field.handleChange(event.target.value as QuotaFormValue['subjectType']); form.setFieldValue('subjectIds', []); }}><option value="ALL_MEMBERS">所有成员</option><option value="ACCESS_GROUP">指定用户组</option><option value="MEMBER">指定成员</option></select>}</form.Field>
          <form.Subscribe selector={(state) => state.values.subjectType}>{(subjectType) => subjectType === 'ACCESS_GROUP' ? <form.Field name="subjectIds" validators={{ onSubmit: subjectValidator('个用户组') }}>{(field) => <select multiple aria-label="用户组" value={field.state.value} onChange={(event) => field.handleChange(Array.from(event.target.selectedOptions, (option) => option.value))}>{accessGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>}</form.Field> : subjectType === 'MEMBER' ? <form.Field name="subjectIds" validators={{ onSubmit: subjectValidator('位成员') }}>{(field) => <MemberSelect aria-label="成员" className={inputClass} value="" onValueChange={(id) => { if (id && !field.state.value.includes(id)) field.handleChange([...field.state.value, id]); }} />}</form.Field> : null}</form.Subscribe>
          <form.Field name="resourceType">{(field) => <select aria-label="资源范围" value={field.state.value} onChange={(event) => { field.handleChange(event.target.value as QuotaFormValue['resourceType']); form.setFieldValue('resourceId', ''); }}><option value="ALL_MODELS">全部模型</option><option value="MODEL_SET">模型集</option><option value="MODEL">单个模型</option></select>}</form.Field>
          <form.Subscribe selector={(state) => state.values.resourceType}>{(resourceType) => resourceType === 'ALL_MODELS' ? null : <form.Field name="resourceId" validators={{ onSubmit: requiredText }}>{(field) => <label>{resourceType === 'MODEL_SET' ? '模型集' : '模型'}<select aria-label={resourceType === 'MODEL_SET' ? '模型集' : '模型'} className={inputClass} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)}><option value="">选择资源</option>{resourceType === 'MODEL_SET' ? modelSets.map((set) => <option key={set.id} value={set.id}>{set.name} ({set.modelCount})</option>) : models.map((model) => <option key={model.id} value={model.id} disabled={model.status === 'DISABLED'}>{modelLabel(model)}</option>)}</select></label>}</form.Field>}</form.Subscribe>
          <form.Field name="status">{(field) => <select aria-label="状态" value={field.state.value} onChange={(event) => field.handleChange(event.target.value as QuotaFormValue['status'])}><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select>}</form.Field>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 text-xs">
          <form.Field name="name" validators={{ onSubmit: requiredText }}>{(field) => <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">策略名称<input autoFocus className={inputClass} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} placeholder={type === 'TOKEN' ? '例如：核心成员每日与月度配额' : '例如：产研并发限流'} /><ErrorText errors={field.state.meta.errors} /></label>}</form.Field>

          <form.Subscribe selector={(state) => [state.values.subjectType, state.values.subjectIds] as const}>{([subjectType, subjectIds]) => <SubjectPicker label="适用对象" hint="选择该策略生效的成员或团队范围" subjectType={subjectType} subjectIds={subjectIds} onTypeChange={(next) => { form.setFieldValue('subjectType', next); form.setFieldValue('subjectIds', []); }} onIdsChange={(ids) => form.setFieldValue('subjectIds', ids)} accessGroups={accessGroups} members={members} allTitle={type === 'TOKEN' ? '该配额将作为企业内每位成员的默认调用上限生效' : '该速率限制将作为企业内每位成员的默认调用上限生效'} allDescription="每位成员各自持有独立的额度窗口，互不共享。" />}</form.Subscribe>

          <form.Subscribe selector={(state) => [state.values.resourceType, state.values.resourceId] as const}>{([resourceType, resourceId]) => <ResourcePicker label="资源范围" hint="决定哪些模型的消耗计入此策略" resourceType={resourceType} resourceId={resourceId} onTypeChange={(next) => form.setFieldValue('resourceType', next)} onIdChange={(id) => form.setFieldValue('resourceId', id)} modelSets={modelSets} models={models} connections={connections} includeAllModels />}</form.Subscribe>

          {type === 'TOKEN' ? (() => {
            return <fieldset className="space-y-3 overflow-hidden rounded-xl border border-line p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5"><legend className="px-0 font-semibold text-ink-2">Token 额度 <span className="text-red">*</span></legend><span className="text-[11px] text-ink-3">勾选需要限制的时间窗口并填入上限，未勾选则不限额</span></div>
              <div className="divide-y divide-line">
                {TOKEN_WINDOWS.map((item) => {
                  return (
                    <form.Field key={item.field} name={item.field} validators={{ onSubmit: optionalPositiveInteger }}>
                      {(field) => {
                        const enabled = field.state.value !== '';
                        return (
                          <div className="grid gap-2 px-4 py-3 sm:grid-cols-[110px_1fr] sm:items-center">
                            <div className="grid gap-0.5"><label className="flex cursor-pointer select-none items-center gap-2 text-[12.5px] font-medium text-ink-2"><input type="checkbox" checked={enabled} onChange={(event) => field.handleChange(event.target.checked ? item.initial : '')} />{item.label}</label><span className="pl-5 text-[10px] text-ink-3">{item.hint}</span></div>
                            <div className="grid gap-1.5">
                              {enabled ? <div className="flex flex-wrap items-center gap-1.5">
                                <span className="relative">
                                  <input aria-label={`${item.label} Token 额度`} type="number" min="1" step="1" className={`${inputClass} w-44 pr-16 font-mono`} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
                                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-ink/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink">≈ {compactTokens(parseTokens(field.state.value))}</span>
                                </span>
                                {TOKEN_PRESETS.map((preset) => <button key={preset.label} type="button" className={`rounded-md border px-2 py-1 font-mono text-[11px] transition ${field.state.value === preset.value ? 'border-transparent bg-field font-semibold text-ink' : 'border-transparent bg-field text-ink-3 hover:bg-hover hover:text-ink'}`} onClick={() => field.handleChange(preset.value)}>{preset.label}</button>)}
                              </div> : <button type="button" className="flex h-9 items-center justify-between rounded-lg border border-line bg-field px-3 text-[12.5px] text-ink-3 transition hover:bg-hover" onClick={() => field.handleChange(item.initial)}><span>无限制</span><span className="text-[11px] font-medium">勾选左侧开启限制</span></button>}
                              <ErrorText errors={field.state.meta.errors} />
                            </div>
                          </div>
                        );
                      }}
                    </form.Field>
                  );
                })}
              </div>

            </fieldset>;
          })() : null}

          {type === 'RATE' ? <fieldset className="grid gap-3 rounded-xl border border-line p-4">
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

          <form.Subscribe selector={(state) => state.values.status}>{(status) => <StatusToggle value={status} onChange={(next) => form.setFieldValue('status', next)} activeHint="保存后该限制将立即对所选对象生效" inactiveHint="当前处于停用状态，仅保存规则但不触发拦截" />}</form.Subscribe>

          {error ? <p role="alert" className="m-0 rounded-lg bg-red-tint px-3 py-2 text-xs text-red">{error}</p> : null}
        </div>
        <DialogFooter className="shrink-0 border-line bg-field px-6"><Button type="button" size="sm" className="rounded-full border border-line bg-surface px-4" onClick={onClose}>取消</Button><form.Subscribe selector={(state) => state.canSubmit}>{(canSubmit) => <Button type="submit" variant="primary" size="sm" className="rounded-full px-5" disabled={!canSubmit || saving}>{saving ? '保存中' : '保存'}</Button>}</form.Subscribe></DialogFooter>
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
        <DialogFooter sticky><Button type="button" size="sm" disabled={saving} onClick={onClose}>取消</Button><Button type="button" variant="primary" size="sm" className="bg-red text-canvas hover:brightness-95" disabled={saving} onClick={onConfirm}>{saving ? '删除中' : '删除'}</Button></DialogFooter>
      </div>
    </ProductDialog>
  );
}
