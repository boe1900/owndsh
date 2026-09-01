/**
 * [INPUT]: 依赖 TanStack Form、Zod、共享 MemberSelect、ProductDialog、Beautiful UI Button 和生成的授权/配额 DTO。
 * [OUTPUT]: 提供模型授权编辑器、配额策略编辑器与删除确认对话框。
 * [POS]: features/access 的纯表单层，只收集合法产品作用域，不持有查询缓存、权限判断或 Server mutation。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useForm } from '@tanstack/react-form';
import { z } from 'zod';
import type {
  ManagedModel,
  ModelGrant,
  ModelGrantWriteRequest,
  QuotaPolicy,
  QuotaPolicyWriteRequest
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { ProductDialog } from '@/components/product/Dialog';
import { MemberSelect } from '@/features/member-select';

const inputClass = 'h-9 w-full rounded-lg border border-line bg-canvas px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-tint';
const requiredText = z.string().trim().min(1, '不能为空');
const optionalPositiveInteger = z.union([
  z.literal(''),
  z.string().regex(/^[1-9]\d*$/, '请输入正整数')
]);

function fieldError(errors: ReadonlyArray<unknown>) {
  for (const error of errors) {
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      return error.message;
    }
  }
  return undefined;
}

function ErrorText({ errors }: { errors: ReadonlyArray<unknown> }) {
  const message = fieldError(errors);
  return message ? <span role="alert" className="text-[12px] text-red">{message}</span> : null;
}

type GrantFormValue = {
  modelId: string;
  subjectType: 'ALL_MEMBERS' | 'MEMBER';
  subjectId: string;
  status: 'ACTIVE' | 'DISABLED';
};

export function GrantEditorDialog({
  current,
  error,
  models,
  onClose,
  onSave,
  saving
}: {
  current?: ModelGrant;
  error?: string;
  models: ReadonlyArray<ManagedModel>;
  onClose: () => void;
  onSave: (value: ModelGrantWriteRequest) => void;
  saving: boolean;
}) {
  const form = useForm({
    defaultValues: {
      modelId: current?.modelId ?? '',
      subjectType: current?.subjectType ?? 'ALL_MEMBERS',
      subjectId: current?.subjectId ?? '',
      status: current?.status ?? 'ACTIVE'
    } satisfies GrantFormValue,
    onSubmit: ({ value }) => {
      onSave({
        modelId: value.modelId,
        subjectType: value.subjectType,
        subjectId: value.subjectType === 'ALL_MEMBERS' ? null : value.subjectId,
        status: value.status
      });
    }
  });

  return (
    <ProductDialog title={current ? '编辑模型授权' : '新建模型授权'} onClose={onClose}>
      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="modelId" validators={{ onSubmit: requiredText }}>
          {(field) => (
            <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
              模型
              <select
                autoFocus
                className={inputClass}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              >
                <option value="">选择模型</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name ?? model.alias} ({model.alias}){model.status === 'DISABLED' ? ' - 已停用' : ''}
                  </option>
                ))}
              </select>
              <ErrorText errors={field.state.meta.errors} />
            </label>
          )}
        </form.Field>

        <form.Field name="subjectType">
          {(field) => (
            <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
              授权对象
              <select
                className={inputClass}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value as GrantFormValue['subjectType'])}
              >
                <option value="ALL_MEMBERS">所有成员</option>
                <option value="MEMBER">指定成员</option>
              </select>
            </label>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.subjectType}>
          {(subjectType) => subjectType === 'MEMBER' ? (
            <form.Field name="subjectId" validators={{ onSubmit: requiredText }}>
              {(field) => (
                <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                  成员
                  <MemberSelect
                    className={inputClass}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onValueChange={field.handleChange}
                  />
                  <ErrorText errors={field.state.meta.errors} />
                </label>
              )}
            </form.Field>
          ) : null}
        </form.Subscribe>

        <form.Field name="status">
          {(field) => (
            <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
              状态
              <select
                className={inputClass}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value as GrantFormValue['status'])}
              >
                <option value="ACTIVE">启用</option>
                <option value="DISABLED">停用</option>
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

type QuotaFormValue = {
  name: string;
  subjectType: 'ORGANIZATION' | 'MEMBER';
  subjectId: string;
  dailyTokenLimit: string;
  monthlyTokenLimit: string;
  rpm: string;
  concurrency: string;
  status: 'ACTIVE' | 'DISABLED';
};

function nullableInteger(value: string) {
  return value === '' ? null : Number(value);
}

export function QuotaEditorDialog({
  current,
  error,
  onClose,
  onSave,
  saving
}: {
  current?: QuotaPolicy;
  error?: string;
  onClose: () => void;
  onSave: (value: QuotaPolicyWriteRequest) => void;
  saving: boolean;
}) {
  const form = useForm({
    defaultValues: {
      name: current?.name ?? '',
      subjectType: current?.subjectType ?? 'MEMBER',
      subjectId: current?.subjectId ?? '',
      dailyTokenLimit: current?.dailyTokenLimit?.toString() ?? '',
      monthlyTokenLimit: current?.monthlyTokenLimit?.toString() ?? '',
      rpm: current?.rpm?.toString() ?? '',
      concurrency: current?.concurrency?.toString() ?? '',
      status: current?.status ?? 'ACTIVE'
    } satisfies QuotaFormValue,
    onSubmit: ({ value }) => {
      onSave({
        name: value.name.trim(),
        subjectType: value.subjectType,
        subjectId: value.subjectType === 'ORGANIZATION' ? null : value.subjectId,
        dailyTokenLimit: nullableInteger(value.dailyTokenLimit),
        monthlyTokenLimit: nullableInteger(value.monthlyTokenLimit),
        rpm: nullableInteger(value.rpm),
        concurrency: nullableInteger(value.concurrency),
        status: value.status
      });
    }
  });

  return (
    <ProductDialog title={current ? '编辑使用策略' : '新建使用策略'} onClose={onClose}>
      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name" validators={{ onSubmit: requiredText }}>
          {(field) => (
            <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
              策略名称
              <input
                autoFocus
                className={inputClass}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <ErrorText errors={field.state.meta.errors} />
            </label>
          )}
        </form.Field>

        <form.Field name="subjectType">
          {(field) => (
            <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
              作用域
              <select
                className={inputClass}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value as QuotaFormValue['subjectType'])}
              >
                <option value="ORGANIZATION">整个组织</option>
                <option value="MEMBER">指定成员</option>
              </select>
            </label>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.subjectType}>
          {(subjectType) => subjectType === 'MEMBER' ? (
            <form.Field name="subjectId" validators={{ onSubmit: requiredText }}>
              {(field) => (
                <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                  成员
                  <MemberSelect
                    className={inputClass}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onValueChange={field.handleChange}
                  />
                  <ErrorText errors={field.state.meta.errors} />
                </label>
              )}
            </form.Field>
          ) : null}
        </form.Subscribe>

        <div className="grid gap-4 sm:grid-cols-2">
          {([
            ['dailyTokenLimit', '每日 Token'],
            ['monthlyTokenLimit', '每月 Token'],
            ['rpm', '每分钟请求'],
            ['concurrency', '并发请求']
          ] as const).map(([name, label]) => (
            <form.Field key={name} name={name} validators={{ onSubmit: optionalPositiveInteger }}>
              {(field) => (
                <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                  {label}
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="无限制"
                    className={inputClass}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <ErrorText errors={field.state.meta.errors} />
                </label>
              )}
            </form.Field>
          ))}
        </div>

        <form.Field name="status">
          {(field) => (
            <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
              状态
              <select
                className={inputClass}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value as QuotaFormValue['status'])}
              >
                <option value="ACTIVE">启用</option>
                <option value="DISABLED">停用</option>
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

export function DeletePolicyDialog({
  error,
  label,
  onClose,
  onConfirm,
  saving
}: {
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
        <footer className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" size="sm" onClick={onClose}>取消</Button>
          <Button type="button" variant="primary" size="sm" className="bg-red text-white hover:brightness-95" disabled={saving} onClick={onConfirm}>
            {saving ? '删除中' : '删除'}
          </Button>
        </footer>
      </div>
    </ProductDialog>
  );
}
