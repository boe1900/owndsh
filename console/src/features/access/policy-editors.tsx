/**
 * [INPUT]: 依赖 TanStack Form、Zod、成员目录、产品对话框及生成的用户组/模型集/授权/配额 DTO。
 * [OUTPUT]: 提供模型授权、互斥 TOKEN/RATE 策略编辑器及删除确认对话框。
 * [POS]: features/access 的纯表单层；共享主体/资源外壳，但不让 Token 窗口与 RPM/并发出现在同一表单。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useForm } from '@tanstack/react-form';
import { z } from 'zod';
import type {
  AccessGroup,
  ManagedModel,
  ModelGrant,
  ModelGrantWriteRequest,
  ModelSet,
  QuotaPolicy,
  QuotaPolicyWriteRequest,
  QuotaWindow
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { ProductDialog } from '@/components/product/Dialog';
import { MemberSelect } from '@/features/member-select';

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

type GrantFormValue = {
  resourceType: 'MODEL_SET' | 'MODEL';
  resourceId: string;
  subjectType: 'ALL_MEMBERS' | 'ACCESS_GROUP' | 'MEMBER';
  subjectId: string;
  status: 'ACTIVE' | 'DISABLED';
};

export function GrantEditorDialog({ accessGroups, current, error, modelSets, models, onClose, onSave, saving }: {
  accessGroups: ReadonlyArray<AccessGroup>;
  current?: ModelGrant;
  error?: string;
  modelSets: ReadonlyArray<ModelSet>;
  models: ReadonlyArray<ManagedModel>;
  onClose: () => void;
  onSave: (value: ModelGrantWriteRequest) => void;
  saving: boolean;
}) {
  const form = useForm({
    defaultValues: {
      resourceType: current?.resourceType ?? 'MODEL_SET',
      resourceId: current?.resourceId ?? '',
      subjectType: current?.subjectType ?? 'ALL_MEMBERS',
      subjectId: current?.subjectId ?? '',
      status: current?.status ?? 'ACTIVE'
    } satisfies GrantFormValue,
    onSubmit: ({ value }) => onSave({
      resourceType: value.resourceType,
      resourceId: value.resourceId,
      subjectType: value.subjectType,
      subjectId: value.subjectType === 'ALL_MEMBERS' ? null : value.subjectId,
      status: value.status
    })
  });

  return (
    <ProductDialog className="max-w-[620px]" title={current ? '编辑模型授权' : '新建模型授权'} onClose={onClose}>
      <form className="grid gap-4 p-5" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="resourceType">
            {(field) => <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">资源类型<select autoFocus className={inputClass} value={field.state.value} onChange={(event) => { field.handleChange(event.target.value as GrantFormValue['resourceType']); form.setFieldValue('resourceId', ''); }}><option value="MODEL_SET">模型集</option><option value="MODEL">单个模型</option></select></label>}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.resourceType}>
            {(resourceType) => (
              <form.Field name="resourceId" validators={{ onSubmit: requiredText }}>
                {(field) => <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">资源<select className={inputClass} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)}><option value="">选择资源</option>{resourceType === 'MODEL_SET' ? modelSets.map((set) => <option key={set.id} value={set.id}>{set.name} ({set.modelCount})</option>) : models.map((model) => <option key={model.id} value={model.id} disabled={model.status === 'DISABLED'}>{modelLabel(model)}</option>)}</select><ErrorText errors={field.state.meta.errors} /></label>}
              </form.Field>
            )}
          </form.Subscribe>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="subjectType">
            {(field) => <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">授权对象<select className={inputClass} value={field.state.value} onChange={(event) => { field.handleChange(event.target.value as GrantFormValue['subjectType']); form.setFieldValue('subjectId', ''); }}><option value="ALL_MEMBERS">所有成员</option><option value="ACCESS_GROUP">指定用户组</option><option value="MEMBER">指定成员</option></select></label>}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.subjectType}>
            {(subjectType) => subjectType === 'ALL_MEMBERS' ? <div /> : (
              <form.Field name="subjectId" validators={{ onSubmit: requiredText }}>
                {(field) => <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">{subjectType === 'ACCESS_GROUP' ? '用户组' : '成员'}{subjectType === 'ACCESS_GROUP' ? <select className={inputClass} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)}><option value="">选择用户组</option>{accessGroups.map((group) => <option key={group.id} value={group.id}>{group.name} ({group.memberCount})</option>)}</select> : <MemberSelect className={inputClass} value={field.state.value} onBlur={field.handleBlur} onValueChange={field.handleChange} />}<ErrorText errors={field.state.meta.errors} /></label>}
              </form.Field>
            )}
          </form.Subscribe>
        </div>

        <form.Field name="status">
          {(field) => <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">状态<select className={inputClass} value={field.state.value} onChange={(event) => field.handleChange(event.target.value as GrantFormValue['status'])}><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select></label>}
        </form.Field>
        {error ? <p role="alert" className="m-0 rounded-md bg-red-tint px-3 py-2 text-[12.5px] text-red">{error}</p> : null}
        <footer className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" size="sm" onClick={onClose}>取消</Button><form.Subscribe selector={(state) => state.canSubmit}>{(canSubmit) => <Button type="submit" variant="primary" size="sm" disabled={!canSubmit || saving}>{saving ? '保存中' : '保存'}</Button>}</form.Subscribe></footer>
      </form>
    </ProductDialog>
  );
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
      resourceType: current?.resourceType === 'PROVIDER' ? 'ALL_MODELS' : current?.resourceType ?? 'ALL_MODELS',
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
        <footer className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" size="sm" onClick={onClose}>取消</Button><form.Subscribe selector={(state) => state.canSubmit}>{(canSubmit) => <Button type="submit" variant="primary" size="sm" disabled={!canSubmit || saving}>{saving ? '保存中' : '保存'}</Button>}</form.Subscribe></footer>
      </form>
    </ProductDialog>
  );
}

export function DeletePolicyDialog({ error, label, onClose, onConfirm, saving }: {
  error?: string;
  label: string;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  return (
    <ProductDialog title="确认删除" onClose={onClose}>
      <div className="space-y-5 p-5">
        <p className="m-0 text-[13px] leading-6 text-ink-2">确定删除“{label}”？该操作会立即影响后续模型请求。</p>
        {error ? <p role="alert" className="m-0 rounded-md bg-red-tint px-3 py-2 text-[12.5px] text-red">{error}</p> : null}
        <footer className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" size="sm" onClick={onClose}>取消</Button><Button type="button" variant="primary" size="sm" className="bg-red text-white hover:brightness-95" disabled={saving} onClick={onConfirm}>{saving ? '删除中' : '删除'}</Button></footer>
      </div>
    </ProductDialog>
  );
}
