/**
 * [INPUT]: 依赖 TanStack Form、Zod、成员目录、产品对话框、生成的用户组/模型集/授权/配额 DTO 与 coss UI Avatar/Badge/Button/Card/Checkbox/Empty/Field/Fieldset/Input/InputGroup/Switch/Alert。
 * [OUTPUT]: 提供模型授权、互斥 TOKEN/RATE 策略编辑器、删除确认对话框与 compactTokens 工具。
 * [POS]: features/access 的纯表单层；共享主体/资源外壳，但不让 Token 窗口与 RPM/并发出现在同一表单。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useForm } from '@tanstack/react-form';
import { Building2, Check, Cpu, Globe, Image as ImageIcon, Layers, Search, Server, Sparkles, UserCheck, X } from 'lucide-react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Fieldset, FieldsetLegend } from '@/components/ui/fieldset';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/product/ConfirmDialog';
import { ProductDialog } from '@/components/product/Dialog';
import { DialogFooter } from '@/components/product/DialogFooter';
import { MemberSelect } from '@/features/member-select';
import { formatTokenCapacity } from '@/features/models/token-capacity';

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
  return message ? <FieldError>{message}</FieldError> : null;
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
  const selectedCards = subjectIds.map((id) => {
    if (subjectType === 'ACCESS_GROUP') {
      const group = accessGroups.find((candidate) => candidate.id === id);
      return group ? { id, name: group.name, avatar: <Building2 aria-hidden className="size-3.5 text-muted-foreground" /> } : { id, name: id, avatar: null };
    }
    const member = members.find((candidate) => candidate.id === id);
    return member
      ? { id, name: member.displayName, avatar: <Avatar className="size-4 text-[9px]"><AvatarFallback className="bg-primary/10 font-semibold text-primary">{member.displayName.slice(0, 1)}</AvatarFallback></Avatar> }
      : { id, name: id, avatar: null };
  });
  return (
    <section className="space-y-3 border-t pt-5">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">{label} <span className="text-destructive-foreground">*</span></span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {([
          { value: 'ALL_MEMBERS', label: '所有成员', description: '全员统一默认', icon: Globe },
          { value: 'ACCESS_GROUP', label: '指定用户组', description: '按部门/团队选择', icon: Building2 },
          { value: 'MEMBER', label: '指定成员', description: '按个人账号选择', icon: UserCheck }
        ] as const).map((item) => {
          const Icon = item.icon;
          const selected = subjectType === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => { onTypeChange(item.value); onIdsChange([]); setTargetSearch(''); }}
              className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition ${selected ? 'border-transparent bg-primary text-primary-foreground shadow-md' : 'bg-muted/40 text-foreground hover:bg-accent'}`}
            >
              <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${selected ? 'bg-primary-foreground/15 text-primary-foreground' : 'border bg-background text-muted-foreground'}`}>
                <Icon aria-hidden className="size-3.5" />
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-xs">{item.label}</strong>
                <small className={`mt-0.5 block truncate text-[10px] ${selected ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>{item.description}</small>
              </span>
            </button>
          );
        })}
      </div>
      {subjectType === 'ALL_MEMBERS' ? (
        <Alert variant="success" className="items-center">
          <Globe aria-hidden className="size-4" />
          <AlertDescription>
            <strong className="block text-xs text-foreground">{allTitle}</strong>
            <span className="text-[11px]">{allDescription}</span>
          </AlertDescription>
        </Alert>
      ) : (
        <Card className="space-y-2.5 bg-muted/40 p-3.5 shadow-none">
          {subjectIds.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {(subjectExpanded ? selectedCards : selectedCards.slice(0, 3)).map((card) => (
                <Badge key={card.id} variant="outline" className="gap-1.5 rounded-full bg-background py-0.5 pl-1 pr-1.5 text-xs font-normal">
                  {card.avatar}
                  <span className="max-w-40 truncate">{card.name}</span>
                  <button type="button" aria-label={`移除 ${card.name}`} className="grid size-4 place-items-center rounded-full text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive-foreground" onClick={() => toggle(card.id)}><X aria-hidden className="size-3" /></button>
                </Badge>
              ))}
              {!subjectExpanded && selectedCards.length > 3 ? <Button type="button" variant="outline" size="xs" className="h-5 rounded-full px-2.5" onClick={() => setSubjectExpanded(true)}>+{selectedCards.length - 3}</Button> : null}
              {subjectExpanded && selectedCards.length > 3 ? <Button type="button" variant="outline" size="xs" className="h-5 rounded-full px-2.5" onClick={() => setSubjectExpanded(false)}>收起</Button> : null}
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <InputGroup className="min-w-0 flex-1">
              <InputGroupAddon align="inline-start"><Search aria-hidden className="size-3.5 text-muted-foreground" /></InputGroupAddon>
              <InputGroupInput aria-label={`搜索${label}`} size="sm" value={targetSearch} onChange={(event) => setTargetSearch(event.target.value)} placeholder={subjectType === 'ACCESS_GROUP' ? '搜索用户组...' : '搜索成员姓名或账号...'} />
              {targetSearch ? (
                <InputGroupAddon align="inline-end">
                  <Button type="button" variant="ghost" size="icon-xs" aria-label="清除对象搜索" onClick={() => setTargetSearch('')}><X aria-hidden className="size-3.5" /></Button>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
            <span className="shrink-0 text-[11px] text-muted-foreground">已选 <strong className="text-foreground">{subjectIds.length}</strong> 个</span>
          </div>
          <div className="grid max-h-40 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {subjectType === 'ACCESS_GROUP'
              ? visibleGroups.map((group) => {
                  const checked = subjectIds.includes(group.id);
                  return (
                    <button key={group.id} type="button" onClick={() => toggle(group.id)} className="flex items-center justify-between gap-2 rounded-lg border border-transparent bg-background p-2.5 text-left transition hover:bg-accent">
                      <span className="flex min-w-0 items-center gap-2">
                        <Building2 aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <strong className="block truncate text-xs text-foreground">{group.name}</strong>
                          <span className="block text-[10px] text-muted-foreground">{group.memberCount} 人</span>
                        </span>
                      </span>
                      <span className={`grid size-4 shrink-0 place-items-center rounded border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-transparent'}`}><Check aria-hidden className="size-2.5" /></span>
                    </button>
                  );
                })
              : visibleMembers.map((member) => {
                  const checked = subjectIds.includes(member.id);
                  return (
                    <button key={member.id} type="button" disabled={member.status === 'DISABLED'} onClick={() => toggle(member.id)} className="flex items-center justify-between gap-2 rounded-lg border border-transparent bg-background p-2 text-left transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50">
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar className="size-6 text-[10px]"><AvatarFallback className="bg-primary/10 font-semibold text-primary">{member.displayName.slice(0, 1)}</AvatarFallback></Avatar>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs text-foreground">{member.displayName}</strong>
                          <span className="block truncate font-mono text-[10px] text-muted-foreground">{member.username}</span>
                        </span>
                      </span>
                      <span className={`grid size-4 shrink-0 place-items-center rounded border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-transparent'}`}><Check aria-hidden className="size-2.5" /></span>
                    </button>
                  );
                })}
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{subjectIds.length > 0 ? `已选择 ${subjectIds.length} 个${subjectType === 'ACCESS_GROUP' ? '用户组' : '成员'}` : `至少选择 1 个${subjectType === 'ACCESS_GROUP' ? '用户组' : '成员'}`}</span>
            {subjectIds.length > 0 ? <Button type="button" variant="link" size="xs" className="h-auto p-0 text-[11px]" onClick={() => onIdsChange([])}>清空已选</Button> : null}
          </div>
        </Card>
      )}
    </section>
  );
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
  return (
    <section className="space-y-2 border-t pt-5">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">{label} <span className="text-destructive-foreground">*</span></span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      <div className={`grid gap-2.5 ${includeAllModels ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
        {kinds.map((item) => {
          const Icon = item.icon;
          const selected = resourceType === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => { onTypeChange(item.value); onIdChange(suggest(item.value)); setResourceSearch(''); }}
              className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition ${selected ? 'border-transparent bg-primary text-primary-foreground shadow-md' : 'bg-muted/40 text-foreground hover:bg-accent'}`}
            >
              <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${selected ? 'bg-primary-foreground/15 text-primary-foreground' : 'border bg-background text-muted-foreground'}`}>
                <Icon aria-hidden className="size-3.5" />
              </span>
              <span className="min-w-0">
                <strong className={`block truncate text-xs ${selected ? 'text-primary-foreground' : 'text-foreground'}`}>{item.label}</strong>
                <small className={`mt-0.5 block truncate text-[10px] ${selected ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>{item.description}</small>
              </span>
            </button>
          );
        })}
      </div>
      {resourceType === 'ALL_MODELS' ? null : (
        <>
          <InputGroup>
            <InputGroupAddon align="inline-start"><Search aria-hidden className="size-3.5 text-muted-foreground" /></InputGroupAddon>
            <InputGroupInput aria-label="搜索资源" size="sm" value={resourceSearch} onChange={(event) => setResourceSearch(event.target.value)} placeholder={resourceType === 'MODEL_SET' ? '搜索模型集名称或描述...' : '搜索供应商、连接通道或模型名称...'} />
            {resourceSearch ? (
              <InputGroupAddon align="inline-end">
                <Button type="button" variant="ghost" size="icon-xs" aria-label="清除资源搜索" onClick={() => setResourceSearch('')}><X aria-hidden className="size-3.5" /></Button>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
          {resourceType === 'MODEL_SET' ? (
            <Card className="max-h-44 space-y-2 overflow-y-auto bg-muted/40 p-2.5 shadow-none">
              {visibleSets.map((set) => {
                const selected = resourceId === set.id;
                return (
                  <button key={set.id} type="button" onClick={() => onIdChange(set.id)} className={`flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left transition ${selected ? 'border-ring bg-background shadow-sm' : 'border-transparent bg-background/60 hover:bg-accent'}`}>
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <Layers aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                      <strong className="truncate text-xs text-foreground">{set.name}</strong>
                      <Badge variant="outline" size="sm">{set.modelCount} 个模型</Badge>
                    </span>
                    <span className={`grid size-4 shrink-0 place-items-center rounded-full border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-transparent'}`}><Check aria-hidden className="size-2.5" /></span>
                  </button>
                );
              })}
            </Card>
          ) : (
            <div className="max-h-52 space-y-2.5 overflow-y-auto pr-1">
              {providerGroups.map((provider) => (
                <Card key={provider.provider} className="overflow-hidden p-0 shadow-none">
                  <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
                    <span className="grid size-4 place-items-center rounded bg-primary text-[9px] font-bold text-primary-foreground">{provider.provider.slice(0, 1).toUpperCase()}</span>
                    <span className="text-xs font-semibold text-foreground">{provider.provider}</span>
                  </div>
                  {Array.from(provider.modelsByConnection.entries()).map(([connectionId, connectionModels]) => (
                    <div key={connectionId} className="space-y-2 border-b p-2.5 pl-3.5 last:border-b-0">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Server aria-hidden className="size-3" /><span className="font-medium">{connections.get(connectionId) ?? '未命名连接'}</span></div>
                      <div className="flex flex-wrap gap-1.5 pl-4">
                        {connectionModels.map((model) => {
                          const selected = resourceId === model.id;
                          const hasVision = model.input?.some((value) => value.toLowerCase().includes('image'));
                          return (
                            <button key={model.id} type="button" disabled={model.status === 'DISABLED'} onClick={() => onIdChange(model.id)} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-ring bg-accent font-semibold text-foreground' : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted'}`}>
                              <span className={`grid size-3 place-items-center rounded-full border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background'}`}>{selected ? <Check aria-hidden className="size-2" /> : null}</span>
                              <span>{resourceLabel(model)}</span>
                              <Badge variant="outline" size="sm" className="gap-1 px-1 py-0 text-[10px]">
                                {formatTokenCapacity(model.contextWindow) || '—'}
                                {hasVision ? <><span>·</span><ImageIcon aria-hidden className="size-2.5 text-muted-foreground" /><span>图</span></> : null}
                              </Badge>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </Card>
              ))}
            </div>
          )}
          {(resourceType === 'MODEL_SET' ? visibleSets.length : visibleModels.length) === 0 ? (
            <Empty className="py-6">
              <EmptyTitle className="text-sm">没有匹配的资源</EmptyTitle>
              <EmptyDescription className="text-xs">调整关键词后重试</EmptyDescription>
            </Empty>
          ) : null}
        </>
      )}
    </section>
  );
}

/** 授权与配额共用的状态开关卡片：状态灯 + 动态说明 + coss Switch。 */
function StatusToggle({ value, onChange, activeHint, inactiveHint }: {
  value: 'ACTIVE' | 'DISABLED';
  onChange: (value: 'ACTIVE' | 'DISABLED') => void;
  activeHint: string;
  inactiveHint: string;
}) {
  return (
    <Card className="flex flex-row items-center justify-between gap-4 bg-muted/40 p-3.5 shadow-none">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`size-2.5 shrink-0 rounded-full ${value === 'ACTIVE' ? 'bg-success ring-4 ring-success/15' : 'bg-muted-foreground'}`} />
        <div className="min-w-0">
          <strong className="block text-xs text-foreground">状态：{value === 'ACTIVE' ? '启用' : '停用'}</strong>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{value === 'ACTIVE' ? activeHint : inactiveHint}</span>
        </div>
      </div>
      <Switch checked={value === 'ACTIVE'} onCheckedChange={(checked) => onChange(checked ? 'ACTIVE' : 'DISABLED')} aria-label="规则状态" />
    </Card>
  );
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

  return (
    <ProductDialog className="flex max-w-[640px] flex-col overflow-hidden rounded-2xl" title={current ? '编辑模型授权' : '新建模型授权'} description="选择「模型集」或「单个模型」资源，并配置允许访问的成员范围" onClose={onClose}>
      <form className="flex min-h-0 flex-1 flex-col bg-card" onSubmit={(event) => { event.preventDefault(); if (canSave) onSave({ resourceType, resourceId, subjectType, subjectIds, status }); }}>
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
          {error ? <Alert variant="error"><AlertDescription>{error}</AlertDescription></Alert> : null}
        </div>
        <DialogFooter className="shrink-0 bg-muted/40 px-6">
          <Button type="button" variant="outline" size="sm" className="rounded-full px-4" onClick={onClose}>取消</Button>
          <Button type="submit" size="sm" className="rounded-full px-5" disabled={!canSave || saving}>{saving ? '保存中' : '保存'}</Button>
        </DialogFooter>
      </form>
    </ProductDialog>
  );
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
      <form className="flex min-h-0 flex-1 flex-col bg-card" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(); }}>
        <div className="sr-only">
          <form.Field name="subjectType">{(field) => <select aria-label="适用对象" value={field.state.value} onChange={(event) => { field.handleChange(event.target.value as QuotaFormValue['subjectType']); form.setFieldValue('subjectIds', []); }}><option value="ALL_MEMBERS">所有成员</option><option value="ACCESS_GROUP">指定用户组</option><option value="MEMBER">指定成员</option></select>}</form.Field>
          <form.Subscribe selector={(state) => state.values.subjectType}>{(subjectType) => subjectType === 'ACCESS_GROUP' ? <form.Field name="subjectIds" validators={{ onSubmit: subjectValidator('个用户组') }}>{(field) => <select multiple aria-label="用户组" value={field.state.value} onChange={(event) => field.handleChange(Array.from(event.target.selectedOptions, (option) => option.value))}>{accessGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>}</form.Field> : subjectType === 'MEMBER' ? <form.Field name="subjectIds" validators={{ onSubmit: subjectValidator('位成员') }}>{(field) => <MemberSelect aria-label="成员" value="" onValueChange={(id) => { if (id && !field.state.value.includes(id)) field.handleChange([...field.state.value, id]); }} />}</form.Field> : null}</form.Subscribe>
          <form.Field name="resourceType">{(field) => <select aria-label="资源范围" value={field.state.value} onChange={(event) => { field.handleChange(event.target.value as QuotaFormValue['resourceType']); form.setFieldValue('resourceId', ''); }}><option value="ALL_MODELS">全部模型</option><option value="MODEL_SET">模型集</option><option value="MODEL">单个模型</option></select>}</form.Field>
          <form.Subscribe selector={(state) => state.values.resourceType}>{(resourceType) => resourceType === 'ALL_MODELS' ? null : <form.Field name="resourceId" validators={{ onSubmit: requiredText }}>{(field) => <label>{resourceType === 'MODEL_SET' ? '模型集' : '模型'}<select aria-label={resourceType === 'MODEL_SET' ? '模型集' : '模型'} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)}><option value="">选择资源</option>{resourceType === 'MODEL_SET' ? modelSets.map((set) => <option key={set.id} value={set.id}>{set.name} ({set.modelCount})</option>) : models.map((model) => <option key={model.id} value={model.id} disabled={model.status === 'DISABLED'}>{modelLabel(model)}</option>)}</select></label>}</form.Field>}</form.Subscribe>
          <form.Field name="status">{(field) => <select aria-label="状态" value={field.state.value} onChange={(event) => field.handleChange(event.target.value as QuotaFormValue['status'])}><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select>}</form.Field>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5 text-xs">
          <form.Field name="name" validators={{ onSubmit: requiredText }}>
            {(field) => (
              <Field className="w-full" invalid={field.state.meta.errors.length > 0}>
                <FieldLabel>策略名称</FieldLabel>
                <Input autoFocus value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} placeholder={type === 'TOKEN' ? '例如：核心成员每日与月度配额' : '例如：产研并发限流'} />
                <ErrorText errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => [state.values.subjectType, state.values.subjectIds] as const}>{([subjectType, subjectIds]) => <SubjectPicker label="适用对象" hint="选择该策略生效的成员或团队范围" subjectType={subjectType} subjectIds={subjectIds} onTypeChange={(next) => { form.setFieldValue('subjectType', next); form.setFieldValue('subjectIds', []); }} onIdsChange={(ids) => form.setFieldValue('subjectIds', ids)} accessGroups={accessGroups} members={members} allTitle={type === 'TOKEN' ? '该配额将作为企业内每位成员的默认调用上限生效' : '该速率限制将作为企业内每位成员的默认调用上限生效'} allDescription="每位成员各自持有独立的额度窗口，互不共享。" />}</form.Subscribe>

          <form.Subscribe selector={(state) => [state.values.resourceType, state.values.resourceId] as const}>{([resourceType, resourceId]) => <ResourcePicker label="资源范围" hint="决定哪些模型的消耗计入此策略" resourceType={resourceType} resourceId={resourceId} onTypeChange={(next) => form.setFieldValue('resourceType', next)} onIdChange={(id) => form.setFieldValue('resourceId', id)} modelSets={modelSets} models={models} connections={connections} includeAllModels />}</form.Subscribe>

          {type === 'TOKEN' ? (
            <Fieldset className="max-w-none overflow-hidden rounded-xl border p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5">
                <FieldsetLegend className="text-xs font-semibold">Token 额度 <span className="text-destructive-foreground">*</span></FieldsetLegend>
                <span className="text-[11px] text-muted-foreground">勾选需要限制的时间窗口并填入上限，未勾选则不限额</span>
              </div>
              <div className="divide-y">
                {TOKEN_WINDOWS.map((item) => (
                  <form.Field key={item.field} name={item.field} validators={{ onSubmit: optionalPositiveInteger }}>
                    {(field) => {
                      const enabled = field.state.value !== '';
                      return (
                        <div className="grid gap-2 px-4 py-3 sm:grid-cols-[110px_1fr] sm:items-center">
                          <div className="grid gap-0.5">
                            <div className="flex items-center gap-2 text-[12.5px] font-medium text-foreground">
                              <Checkbox id={`token-window-${item.field}`} checked={enabled} onCheckedChange={(checked) => field.handleChange(checked ? item.initial : '')} />
                              <label htmlFor={`token-window-${item.field}`} className="cursor-pointer select-none">{item.label}</label>
                            </div>
                            <span className="pl-6 text-[10px] text-muted-foreground">{item.hint}</span>
                          </div>
                          <div className="grid gap-1.5">
                            {enabled ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <InputGroup className="w-52">
                                  <InputGroupInput aria-label={`${item.label} Token 额度`} type="number" min="1" step="1" className="font-mono" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
                                  <InputGroupAddon align="inline-end">
                                    <Badge variant="secondary" size="sm" className="font-mono text-[10px]">≈ {compactTokens(parseTokens(field.state.value))}</Badge>
                                  </InputGroupAddon>
                                </InputGroup>
                                {TOKEN_PRESETS.map((preset) => (
                                  <Button key={preset.label} type="button" variant={field.state.value === preset.value ? 'secondary' : 'ghost'} size="xs" className="font-mono text-[11px]" onClick={() => field.handleChange(preset.value)}>{preset.label}</Button>
                                ))}
                              </div>
                            ) : (
                              <Button type="button" variant="outline" size="sm" className="justify-between font-normal text-muted-foreground" onClick={() => field.handleChange(item.initial)}>
                                <span>无限制</span>
                                <span className="text-[11px] font-medium">勾选左侧开启限制</span>
                              </Button>
                            )}
                            <ErrorText errors={field.state.meta.errors} />
                          </div>
                        </div>
                      );
                    }}
                  </form.Field>
                ))}
              </div>
            </Fieldset>
          ) : null}

          {type === 'RATE' ? (
            <Fieldset className="max-w-none gap-3 rounded-xl border p-4">
              <FieldsetLegend className="px-1 text-[12.5px] font-semibold">请求约束</FieldsetLegend>
              <div className="grid gap-4 sm:grid-cols-2">
                {([
                  ['rpm', '每分钟请求（RPM）'],
                  ['concurrency', '并发请求']
                ] as const).map(([name, label]) => (
                  <form.Field key={name} name={name} validators={{ onSubmit: optionalPositiveInteger }}>
                    {(field) => {
                      const enabled = field.state.value !== '';
                      return (
                        <Field className="w-full" invalid={field.state.meta.errors.length > 0}>
                          <div className="flex items-center gap-2 text-[12.5px] font-medium text-foreground">
                            <Checkbox id={`rate-limit-${name}`} checked={enabled} onCheckedChange={(checked) => field.handleChange(checked ? '1' : '')} />
                            <label htmlFor={`rate-limit-${name}`} className="cursor-pointer select-none">{label}</label>
                          </div>
                          <Input aria-label={label} type="number" min="1" step="1" placeholder="无限制" disabled={!enabled} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
                          <ErrorText errors={field.state.meta.errors} />
                        </Field>
                      );
                    }}
                  </form.Field>
                ))}
              </div>
            </Fieldset>
          ) : null}

          <form.Subscribe selector={(state) => state.values.status}>{(status) => <StatusToggle value={status} onChange={(next) => form.setFieldValue('status', next)} activeHint="保存后该限制将立即对所选对象生效" inactiveHint="当前处于停用状态，仅保存规则但不触发拦截" />}</form.Subscribe>

          {error ? <Alert variant="error"><AlertDescription>{error}</AlertDescription></Alert> : null}
        </div>
        <DialogFooter className="shrink-0 bg-muted/40 px-6">
          <Button type="button" variant="outline" size="sm" className="rounded-full px-4" onClick={onClose}>取消</Button>
          <form.Subscribe selector={(state) => state.canSubmit}>{(canSubmit) => <Button type="submit" size="sm" className="rounded-full px-5" disabled={!canSubmit || saving}>{saving ? '保存中' : '保存'}</Button>}</form.Subscribe>
        </DialogFooter>
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
    <ConfirmDialog
      title="确认删除"
      description={`确定删除“${label}”？该操作会立即影响后续模型请求。`}
      detail={kind === 'quota' ? '已有使用窗口记录的配额策略不能删除，请改为停用。' : undefined}
      confirmLabel="删除"
      pendingLabel="删除中"
      saving={saving}
      error={error}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
