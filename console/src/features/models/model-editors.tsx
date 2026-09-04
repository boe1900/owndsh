/**
 * [INPUT]: 依赖 TanStack Form、Zod、ProductDialog、生成的 Provider/Quota/模型 DTO 与十进制容量转换。
 * [OUTPUT]: 提供含上游容量的 Provider 编辑器、受管模型编辑器和模型删除确认对话框。
 * [POS]: features/models 的纯表单层，收集供应商配置、共享 RATE 容量和 Harness 模型声明，不持有查询缓存或 Server mutation。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useForm } from '@tanstack/react-form';
import { RefreshCw } from 'lucide-react';
import { useId, useState } from 'react';
import { z } from 'zod';
import type {
  ManagedModel,
  ManagedModelWriteRequest,
  ModelReasoningEfforts,
  Provider,
  ProviderApiProtocol,
  ProviderCreateRequestWritable,
  ProviderDiscoveredModel,
  ProviderType,
  ProviderUpdateRequestWritable,
  QuotaPolicy
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { ProductDialog } from '@/components/product/Dialog';
import {
  formatTokenCapacity,
  parseTokenCapacity,
  TOKEN_CAPACITY_ERROR
} from './token-capacity';

const DEEPSEEK_OFFICIAL_URL = 'https://api.deepseek.com';
const OPENAI_COMPLETIONS = 'openai-completions' as const;
const REASONING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
const THINKING_FORMATS = ['openai', 'deepseek', 'openrouter', 'together', 'zai', 'qwen', 'string-thinking', 'ant-ling'] as const;
const inputClass = 'h-9 w-full rounded-lg border border-line bg-canvas px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-tint disabled:cursor-not-allowed disabled:bg-inset disabled:text-ink-3';
const requiredText = z.string().trim().min(1, '不能为空');
const providerKey = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/, '使用小写字母、数字和连字符');
const alias = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, '使用字母、数字、点、下划线或连字符');
const url = z.string().trim().url('请输入有效 URL');
const sortOrder = z.string().regex(/^\d+$/, '请输入非负整数');
const capacity = z.string().refine((value) => {
  try {
    parseTokenCapacity(value);
    return true;
  } catch {
    return false;
  }
}, TOKEN_CAPACITY_ERROR);
const optionalPositiveInteger = z.union([z.literal(''), z.string().regex(/^[1-9]\d*$/, '请输入正整数')]);

type ReasoningLevel = (typeof REASONING_LEVELS)[number];
type ThinkingFormat = (typeof THINKING_FORMATS)[number];

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

type ProviderFormValue = {
  providerType: ProviderType;
  providerKey: string;
  name: string;
  apiProtocol: ProviderApiProtocol;
  baseUrl: string;
  credential: string;
  replaceSecret: boolean;
  connectTimeoutMs: number;
  readTimeoutMs: number;
  rpm: string;
  concurrency: string;
};

function providerDefaults(current?: Provider, capacity?: QuotaPolicy): ProviderFormValue {
  return {
    providerType: current?.providerType ?? 'DEEPSEEK_OFFICIAL',
    providerKey: current?.providerKey ?? 'deepseek-official',
    name: current?.name ?? 'DeepSeek',
    apiProtocol: current?.apiProtocol ?? OPENAI_COMPLETIONS,
    baseUrl: current?.baseUrl ?? DEEPSEEK_OFFICIAL_URL,
    credential: '',
    replaceSecret: false,
    connectTimeoutMs: current?.connectTimeoutMs ?? 5_000,
    readTimeoutMs: current?.readTimeoutMs ?? 120_000,
    rpm: capacity?.rpm?.toString() ?? '',
    concurrency: capacity?.concurrency?.toString() ?? ''
  };
}

export type ProviderCapacityInput = {
  rpm: number | null;
  concurrency: number | null;
};

export function ProviderEditorDialog({
  canManageCapacity,
  capacity,
  current,
  error,
  onClose,
  onSave,
  saving
}: {
  canManageCapacity: boolean;
  capacity?: QuotaPolicy;
  current?: Provider;
  error?: string;
  onClose: () => void;
  onSave: (
    value: ProviderCreateRequestWritable | ProviderUpdateRequestWritable,
    capacity?: ProviderCapacityInput
  ) => void;
  saving: boolean;
}) {
  const form = useForm({
    defaultValues: providerDefaults(current, capacity),
    onSubmit: ({ value }) => {
      const common = {
        providerKey: value.providerKey.trim(),
        name: value.name.trim(),
        providerType: value.providerType,
        apiProtocol: value.apiProtocol,
        baseUrl: value.baseUrl.trim(),
        connectTimeoutMs: value.connectTimeoutMs,
        readTimeoutMs: value.readTimeoutMs
      };
      const provider = current
        ? {
            ...common,
            replaceSecret: value.replaceSecret,
            ...(value.replaceSecret ? { credential: value.credential } : {})
          }
        : { ...common, credential: value.credential };
      onSave(provider, canManageCapacity ? {
        rpm: value.rpm === '' ? null : Number(value.rpm),
        concurrency: value.concurrency === '' ? null : Number(value.concurrency)
      } : undefined);
    }
  });

  return (
    <ProductDialog title={current ? '编辑模型提供商' : '新建模型提供商'} onClose={onClose}>
      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="providerType">
          {(field) => (
            <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
              提供商类型
              <select
                autoFocus
                className={inputClass}
                disabled={Boolean(current)}
                value={field.state.value}
                onChange={(event) => {
                  const type = event.target.value as ProviderType;
                  field.handleChange(type);
                  form.setFieldValue('providerKey', type === 'DEEPSEEK_OFFICIAL' ? 'deepseek-official' : '');
                  form.setFieldValue('name', type === 'DEEPSEEK_OFFICIAL' ? 'DeepSeek' : '');
                  form.setFieldValue('apiProtocol', OPENAI_COMPLETIONS);
                  form.setFieldValue('baseUrl', type === 'DEEPSEEK_OFFICIAL' ? DEEPSEEK_OFFICIAL_URL : '');
                }}
              >
                <option value="DEEPSEEK_OFFICIAL">DeepSeek 官方</option>
                <option value="CUSTOM">自定义提供商</option>
              </select>
            </label>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.providerType}>
          {(type) => type === 'CUSTOM' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <form.Field name="providerKey" validators={{ onSubmit: providerKey }}>
                {(field) => (
                  <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                    Provider ID
                    <input
                      className={inputClass}
                      disabled={Boolean(current)}
                      placeholder="acme-gateway"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                    <ErrorText errors={field.state.meta.errors} />
                  </label>
                )}
              </form.Field>
              <form.Field name="name" validators={{ onSubmit: requiredText }}>
                {(field) => (
                  <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                    显示名称
                    <input
                      className={inputClass}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                    <ErrorText errors={field.state.meta.errors} />
                  </label>
                )}
              </form.Field>
            </div>
          ) : null}
        </form.Subscribe>

        <form.Field name="baseUrl" validators={{ onSubmit: url }}>
          {(field) => (
            <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
              API 地址
              <input
                className={inputClass}
                placeholder="https://gateway.example/v1"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <ErrorText errors={field.state.meta.errors} />
            </label>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.providerType}>
          {(type) => type === 'CUSTOM' ? (
            <form.Field name="apiProtocol">
              {(field) => (
                <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                  API 协议
                  <select
                    className={inputClass}
                    disabled={Boolean(current)}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value as ProviderApiProtocol)}
                  >
                    <option value="openai-completions">OpenAI Chat Completions</option>
                    <option value="openai-responses">OpenAI Responses</option>
                    <option value="anthropic-messages">Anthropic Messages</option>
                  </select>
                </label>
              )}
            </form.Field>
          ) : null}
        </form.Subscribe>

        {current ? (
          <form.Field name="replaceSecret">
            {(field) => (
              <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
                <input
                  type="checkbox"
                  className="size-4 accent-accent"
                  checked={field.state.value}
                  onChange={(event) => field.handleChange(event.target.checked)}
                />
                替换 API 密钥
              </label>
            )}
          </form.Field>
        ) : null}

        <form.Subscribe selector={(state) => state.values.replaceSecret}>
          {(replaceSecret) => !current || replaceSecret ? (
            <form.Field name="credential" validators={{ onSubmit: requiredText }}>
              {(field) => (
                <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                  {current ? '新 API 密钥' : 'API 密钥'}
                  <input
                    type="password"
                    autoComplete="new-password"
                    className={inputClass}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  <ErrorText errors={field.state.meta.errors} />
                </label>
              )}
            </form.Field>
          ) : null}
        </form.Subscribe>

        {canManageCapacity ? (
          <fieldset className="grid gap-4 rounded-lg border border-line p-4">
            <legend className="px-1 text-[12.5px] font-semibold text-ink">上游容量</legend>
            <p className="m-0 text-[12px] leading-5 text-ink-3">该提供商下所有模型共享此上限；均未启用表示不限制。</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <form.Field name="rpm" validators={{ onSubmit: optionalPositiveInteger }}>
                {(field) => (
                  <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                    <span className="flex items-center gap-2"><input type="checkbox" checked={field.state.value !== ''} onChange={(event) => field.handleChange(event.target.checked ? '1' : '')} />共享 RPM</span>
                    <input aria-label="共享 RPM" className={inputClass} disabled={field.state.value === ''} inputMode="numeric" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
                    <ErrorText errors={field.state.meta.errors} />
                  </label>
                )}
              </form.Field>
              <form.Field name="concurrency" validators={{ onSubmit: optionalPositiveInteger }}>
                {(field) => (
                  <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                    <span className="flex items-center gap-2"><input type="checkbox" checked={field.state.value !== ''} onChange={(event) => field.handleChange(event.target.checked ? '1' : '')} />最大并发</span>
                    <input aria-label="最大并发" className={inputClass} disabled={field.state.value === ''} inputMode="numeric" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
                    <ErrorText errors={field.state.meta.errors} />
                  </label>
                )}
              </form.Field>
            </div>
          </fieldset>
        ) : null}

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

type ModelFormValue = {
  providerId: string;
  alias: string;
  modelId: string;
  name: string;
  contextWindow: string;
  maxTokens: string;
  reasoningMode: 'omitted' | 'disabled' | 'explicit';
  reasoningLevels: ReasoningLevel[];
  reasoningWireValues: Partial<Record<ReasoningLevel, string>>;
  thinkingFormat: '' | ThinkingFormat;
  supportsReasoningEffort: 'auto' | 'true' | 'false';
  sortOrder: string;
};

function modelDefaults(current: ManagedModel | undefined, providers: ReadonlyArray<Provider>): ModelFormValue {
  const explicit = typeof current?.reasoningEfforts === 'object' ? current.reasoningEfforts : undefined;
  return {
    providerId: current?.providerId ?? providers[0]?.id ?? '',
    alias: current?.alias ?? '',
    modelId: current?.modelId ?? '',
    name: current?.name ?? '',
    contextWindow: formatTokenCapacity(current?.contextWindow),
    maxTokens: formatTokenCapacity(current?.maxTokens),
    reasoningMode: current?.reasoningEfforts === undefined
      ? 'omitted'
      : current.reasoningEfforts === false ? 'disabled' : 'explicit',
    reasoningLevels: explicit ? Object.keys(explicit) as ReasoningLevel[] : [],
    reasoningWireValues: explicit
      ? Object.fromEntries(Object.entries(explicit).map(([level, value]) => [level, value ?? '']))
      : {},
    thinkingFormat: current?.compat?.thinkingFormat ?? '',
    supportsReasoningEffort: current?.compat?.supportsReasoningEffort === undefined
      ? 'auto'
      : current.compat.supportsReasoningEffort ? 'true' : 'false',
    sortOrder: String(current?.sortOrder ?? 100)
  };
}

function modelInput(value: ModelFormValue, provider?: Provider): ManagedModelWriteRequest {
  const contextWindow = parseTokenCapacity(value.contextWindow);
  const maxTokens = parseTokenCapacity(value.maxTokens);
  let reasoningEfforts: ModelReasoningEfforts | undefined;
  if (value.reasoningMode === 'disabled') reasoningEfforts = false;
  if (value.reasoningMode === 'explicit') {
    reasoningEfforts = Object.fromEntries(value.reasoningLevels.map((level) => [
      level,
      level === 'off' && !value.reasoningWireValues.off?.trim()
        ? null
        : value.reasoningWireValues[level]?.trim() || level
    ]));
  }
  const compat = provider?.apiProtocol === OPENAI_COMPLETIONS
    && value.reasoningMode === 'explicit'
    && (value.thinkingFormat !== '' || value.supportsReasoningEffort !== 'auto')
    ? {
        ...(value.thinkingFormat === '' ? {} : { thinkingFormat: value.thinkingFormat }),
        ...(value.supportsReasoningEffort === 'auto'
          ? {}
          : { supportsReasoningEffort: value.supportsReasoningEffort === 'true' })
      }
    : undefined;
  return {
    providerId: value.providerId,
    alias: value.alias.trim(),
    modelId: value.modelId.trim(),
    ...(value.name.trim() ? { name: value.name.trim() } : {}),
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(reasoningEfforts === undefined ? {} : { reasoningEfforts }),
    ...(compat === undefined ? {} : { compat }),
    sortOrder: Number(value.sortOrder)
  };
}

export function ModelEditorDialog({
  current,
  error,
  onClose,
  onDiscover,
  onSave,
  providers,
  saving
}: {
  current?: ManagedModel;
  error?: string;
  onClose: () => void;
  onDiscover: (providerId: string) => Promise<ProviderDiscoveredModel[]>;
  onSave: (value: ManagedModelWriteRequest) => void;
  providers: ReadonlyArray<Provider>;
  saving: boolean;
}) {
  const datalistId = useId();
  const [discovered, setDiscovered] = useState<ProviderDiscoveredModel[]>(current
    ? [{ id: current.modelId, name: current.name, contextWindow: current.contextWindow, maxTokens: current.maxTokens }]
    : []);
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string>();
  const form = useForm({
    defaultValues: modelDefaults(current, providers),
    onSubmit: ({ value }) => onSave(modelInput(
      value,
      providers.find((provider) => provider.id === value.providerId)
    ))
  });

  const discover = async () => {
    const providerId = form.state.values.providerId;
    if (!providerId) return;
    setDiscovering(true);
    setDiscoverError(undefined);
    try {
      setDiscovered(await onDiscover(providerId));
    } catch (cause) {
      setDiscoverError(cause instanceof Error ? cause.message : '模型发现失败');
    } finally {
      setDiscovering(false);
    }
  };

  return (
    <ProductDialog className="max-w-[640px]" title={current ? '编辑受管模型' : '新建受管模型'} onClose={onClose}>
      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="providerId" validators={{ onSubmit: requiredText }}>
          {(field) => (
            <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
              模型提供商
              <select
                autoFocus
                className={inputClass}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value);
                  form.setFieldValue('modelId', '');
                  form.setFieldValue('thinkingFormat', '');
                  form.setFieldValue('supportsReasoningEffort', 'auto');
                  setDiscovered([]);
                }}
              >
                <option value="">选择提供商</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.name}{provider.status === 'DISABLED' ? ' - 已停用' : ''}</option>
                ))}
              </select>
              <ErrorText errors={field.state.meta.errors} />
            </label>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.providerId}>
          {(providerId) => {
            const provider = providers.find((item) => item.id === providerId);
            return (
              <form.Field name="modelId" validators={{ onSubmit: requiredText }}>
                {(field) => (
                  <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                    上游模型 ID
                    <span className="flex gap-2">
                      <input
                        list={discovered.length > 0 ? datalistId : undefined}
                        className={inputClass}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => {
                          const modelId = event.target.value;
                          field.handleChange(modelId);
                          const model = discovered.find((item) => item.id === modelId);
                          if (model) {
                            if (!current && !form.state.values.alias) form.setFieldValue('alias', model.id);
                            form.setFieldValue('name', model.name ?? '');
                            form.setFieldValue('contextWindow', formatTokenCapacity(model.contextWindow));
                            form.setFieldValue('maxTokens', formatTokenCapacity(model.maxTokens));
                          }
                        }}
                      />
                      {provider?.apiProtocol !== 'anthropic-messages' ? (
                        <Button type="button" size="sm" className="shrink-0 rounded-lg" disabled={!provider || discovering} onClick={() => void discover()}>
                          <RefreshCw aria-hidden className={discovering ? 'size-3.5 animate-spin' : 'size-3.5'} />
                          {discovering ? '获取中' : '获取模型'}
                        </Button>
                      ) : null}
                    </span>
                    <datalist id={datalistId}>
                      {discovered.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                    </datalist>
                    <ErrorText errors={field.state.meta.errors} />
                    {discoverError ? <span role="alert" className="text-[12px] text-red">{discoverError}</span> : null}
                  </label>
                )}
              </form.Field>
            );
          }}
        </form.Subscribe>

        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="alias" validators={{ onSubmit: alias }}>
            {(field) => (
              <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                模型 ID
                <input className={inputClass} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
                <ErrorText errors={field.state.meta.errors} />
              </label>
            )}
          </form.Field>
          <form.Field name="name">
            {(field) => (
              <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                显示名称（可选）
                <input className={inputClass} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} />
              </label>
            )}
          </form.Field>
        </div>

        <details className="rounded-lg border border-line bg-canvas open:bg-surface">
          <summary className="cursor-pointer px-3 py-2.5 text-[12.5px] font-medium text-ink-2">容量与推理</summary>
          <div className="space-y-4 border-t border-line p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <form.Field name="contextWindow" validators={{ onSubmit: capacity }}>
                {(field) => (
                  <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                    上下文窗口
                    <input className={inputClass} placeholder="256K" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
                    <ErrorText errors={field.state.meta.errors} />
                  </label>
                )}
              </form.Field>
              <form.Field name="maxTokens" validators={{ onSubmit: capacity }}>
                {(field) => (
                  <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                    最大输出 Token
                    <input className={inputClass} placeholder="32K" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
                    <ErrorText errors={field.state.meta.errors} />
                  </label>
                )}
              </form.Field>
            </div>

            <form.Field name="reasoningMode">
              {(field) => (
                <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                  reasoningEfforts
                  <select className={inputClass} value={field.state.value} onChange={(event) => field.handleChange(event.target.value as ModelFormValue['reasoningMode'])}>
                    <option value="omitted">未声明</option>
                    <option value="disabled">不支持（false）</option>
                    <option value="explicit">显式档位映射</option>
                  </select>
                </label>
              )}
            </form.Field>

            <form.Subscribe selector={(state) => ({ mode: state.values.reasoningMode, providerId: state.values.providerId })}>
              {({ mode, providerId }) => mode === 'explicit' ? (
                <div className="space-y-4">
                  <form.Field name="reasoningLevels" validators={{ onSubmit: z.array(z.enum(REASONING_LEVELS)).min(1, '至少选择一个档位') }}>
                    {(field) => (
                      <fieldset className="space-y-2">
                        <legend className="text-[12.5px] font-medium text-ink-2">支持档位</legend>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                          {REASONING_LEVELS.map((level) => (
                            <label key={level} className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                              <input
                                type="checkbox"
                                className="size-4 accent-accent"
                                checked={field.state.value.includes(level)}
                                onChange={(event) => {
                                  field.handleChange(event.target.checked
                                    ? [...field.state.value, level]
                                    : field.state.value.filter((item) => item !== level));
                                  if (event.target.checked && level !== 'off' && !form.state.values.reasoningWireValues[level]) {
                                    form.setFieldValue('reasoningWireValues', {
                                      ...form.state.values.reasoningWireValues,
                                      [level]: level
                                    });
                                  }
                                }}
                              />
                              {level}
                            </label>
                          ))}
                        </div>
                        <ErrorText errors={field.state.meta.errors} />
                      </fieldset>
                    )}
                  </form.Field>

                  <form.Subscribe selector={(state) => state.values.reasoningLevels}>
                    {(levels) => levels.length > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {levels.map((level) => (
                          <label key={level} className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                            {level} wire 值
                            <input
                              className={inputClass}
                              placeholder={level === 'off' ? '留空发送 null' : level}
                              value={form.state.values.reasoningWireValues[level] ?? ''}
                              onChange={(event) => form.setFieldValue('reasoningWireValues', {
                                ...form.state.values.reasoningWireValues,
                                [level]: event.target.value
                              })}
                            />
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </form.Subscribe>

                  {providers.find((provider) => provider.id === providerId)?.apiProtocol === OPENAI_COMPLETIONS ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <form.Field name="thinkingFormat">
                        {(field) => (
                          <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                            compat.thinkingFormat
                            <select className={inputClass} value={field.state.value} onChange={(event) => field.handleChange(event.target.value as ModelFormValue['thinkingFormat'])}>
                              <option value="">自动检测</option>
                              {THINKING_FORMATS.map((value) => <option key={value} value={value}>{value}</option>)}
                            </select>
                          </label>
                        )}
                      </form.Field>
                      <form.Field name="supportsReasoningEffort">
                        {(field) => (
                          <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                            compat.supportsReasoningEffort
                            <select className={inputClass} value={field.state.value} onChange={(event) => field.handleChange(event.target.value as ModelFormValue['supportsReasoningEffort'])}>
                              <option value="auto">自动检测</option>
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          </label>
                        )}
                      </form.Field>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </form.Subscribe>
          </div>
        </details>

        <form.Field name="sortOrder" validators={{ onSubmit: sortOrder }}>
          {(field) => (
            <label className="grid max-w-40 gap-1.5 text-[12.5px] font-medium text-ink-2">
              排序
              <input type="number" min="0" step="1" className={inputClass} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
              <ErrorText errors={field.state.meta.errors} />
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

export function DeleteModelDialog({
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
        <p className="m-0 text-[13px] leading-6 text-ink-2">确定删除“{label}”？已有授权会阻止删除。</p>
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
