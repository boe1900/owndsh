/**
 * [INPUT]: 依赖 React、共享 MemberSelect、ProductDialog、PluginCategorySelect、插件 DTO 与浏览器原生表单控件。
 * [OUTPUT]: 提供首次登记、锁定包名并继承资料的新增版本、发布并沿用指定旧版范围、范围编辑和退休确认；员工仍自主安装。
 * [POS]: features/plugins 的写入表单层，只收集产品语义，不解析包或执行安装命令，也不持有 mutation。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type {
  PluginAssignmentWrite,
  PluginRegistrationRequest,
  PluginPackage,
  PluginPublishRequest,
  PluginVersion
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { ProductDialog } from '@/components/product/Dialog';
import { MemberSelect } from '@/features/member-select';
import { PluginCategorySelect } from './plugin-category-select';

const inputClass = 'h-9 w-full rounded-lg border border-line bg-canvas px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-tint';

export type PluginRegistrationValue = PluginRegistrationRequest;

type ProductAssignment = Omit<PluginAssignmentWrite, 'subjectType'> & {
  subjectType: 'ALL' | 'USER';
};

export type PluginAssignmentValue = {
  items: ProductAssignment[];
  packageId: string;
  revision: number;
};

function editableAssignments(pluginPackage: PluginPackage): ProductAssignment[] {
  return pluginPackage.assignments
    .filter((assignment) => assignment.subjectType !== 'DEPT')
    .map((assignment) => ({
      pluginVersionId: assignment.pluginVersionId,
      subjectType: assignment.subjectType as ProductAssignment['subjectType'],
      subjectId: assignment.subjectId,
      desiredState: assignment.desiredState,
      required: false
    }));
}

export function registrationValue(values: Record<string, string>, categories: string[] = []): PluginRegistrationValue {
  const packageName = (values.packageName ?? '').trim();
  const version = (values.version ?? '').trim();
  return {
    packageName,
    version,
    installation: {
      spec: (values.spec ?? '').trim() || `${packageName}@${version}`,
      displayName: (values.displayName ?? '').trim() || packageName,
      description: (values.description ?? '').trim(),
      author: (values.author ?? '').trim(),
      repositoryUrl: (values.repositoryUrl ?? '').trim(),
      categories: [...new Set(categories.map(value => value.trim()).filter(Boolean))]
    }
  };
}

export function RegisterPluginVersionDialog({ baseVersion, versions = [], categoryOptions, categoriesLoading, categoriesError, onRetryCategories, error, onClose, onSave, saving }: {
  baseVersion?: PluginVersion;
  versions?: ReadonlyArray<PluginVersion>;
  categoryOptions: string[];
  categoriesLoading: boolean;
  categoriesError: boolean;
  onRetryCategories: () => void;
  error?: string;
  onClose: () => void;
  onSave: (value: PluginRegistrationValue) => void;
  saving: boolean;
}) {
  const npmSource = !baseVersion || baseVersion.installation.spec === `${baseVersion.packageName}@${baseVersion.version}`;
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!baseVersion) return {};
    const { categories: _categories, ...metadata } = baseVersion.installation;
    return { ...metadata, packageName: baseVersion.packageName, version: '', spec: npmSource ? '' : metadata.spec };
  });
  const [categories, setCategories] = useState<string[]>(baseVersion?.installation.categories ?? []);
  const [validationError, setValidationError] = useState<string>();
  const fields = [
    ['packageName', '包名', '@company/dsh-plugin', true, 214],
    ['version', '版本', '1.0.0', true, 64],
    ['spec', '安装目标', npmSource && baseVersion ? `自动使用 ${baseVersion.packageName}@${values.version?.trim() || '新版本号'}` : '留空使用包名@版本，或填写 Git / .tgz 地址 / 客户端绝对路径', !npmSource, 2048],
    ['displayName', '显示名称', '留空使用包名', false, 120],
    ['description', '简介', '这个插件能做什么', false, 2000],
    ['author', '作者', '团队或作者名称', false, 120],
    ['repositoryUrl', '源码仓库', 'https://github.com/company/plugin', false, 2048]
  ] as const;
  const renderField = ([key, label, placeholder, required, maxLength]: typeof fields[number]) => <label key={key} className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
    {label}
    <input className={inputClass} name={key} required={required} maxLength={maxLength} disabled={saving}
      readOnly={Boolean(baseVersion) && key === 'packageName'} autoFocus={Boolean(baseVersion) && key === 'version'}
      type={key === 'repositoryUrl' ? 'url' : 'text'} placeholder={placeholder}
      value={values[key] ?? ''} onChange={event => { setValidationError(undefined); setValues(current => ({ ...current, [key]: event.target.value })); }} />
  </label>;
  const metadata = <>
    {fields.slice(3).map(renderField)}
    <PluginCategorySelect options={categoryOptions} value={categories} onChange={setCategories} disabled={saving} />
    {categoriesLoading ? <p role="status" className="m-0 text-[12px] text-ink-3">正在加载已有分类…</p> : null}
    {categoriesError ? <p role="alert" className="m-0 text-[12px] text-red">已有分类加载失败。<button type="button" className="ml-1 underline" onClick={onRetryCategories}>重试</button></p> : null}
  </>;
  return <ProductDialog title={baseVersion ? '新增版本' : '添加插件'} onClose={onClose}>
    <form onSubmit={event => {
      event.preventDefault();
      const value = registrationValue({ ...values, ...(baseVersion ? { packageName: baseVersion.packageName } : {}) }, categories);
      if (baseVersion && (value.version === baseVersion.version || versions.some(item => item.version === value.version))) {
        setValidationError('这个版本已存在，请填写新的版本号。'); return;
      }
      if (baseVersion?.installation.spec.startsWith('github:') && value.installation.spec === baseVersion.installation.spec) {
        setValidationError('请将安装目标改为新版本对应的 Git commit。'); return;
      }
      onSave(value);
    }}>
      <div className="grid gap-4 p-5">
        {baseVersion ? <p className="m-0 text-[12px] text-ink-3">基于 {baseVersion.installation.displayName} v{baseVersion.version}，已沿用插件资料。</p> : null}
        {fields.slice(0, 3).map(renderField)}
        {baseVersion ? <details className="rounded-lg border border-line p-3">
          <summary className="cursor-pointer text-[12.5px] font-medium text-ink-2">插件资料 · 已沿用，按需修改</summary>
          <div className="mt-4 grid gap-4">{metadata}</div>
        </details> : metadata}
        <p className="m-0 text-[12px] text-ink-3">Git 格式：github:组织/仓库#完整 commit，可追加 &amp;path:/子目录。包地址由员工客户端访问；私有源使用宿主已有的认证配置。</p>
        {validationError || error ? <p role="alert" className="m-0 text-[12.5px] text-red">{validationError ?? error}</p> : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
        <Button type="button" size="sm" onClick={onClose}>取消</Button>
        <Button type="submit" variant="primary" size="sm" disabled={saving}>{saving ? '保存中' : '保存版本'}</Button>
      </footer>
    </form>
  </ProductDialog>;
}

export function PublishPluginVersionDialog({ pluginPackage, version, sourceVersionId: preferredSource, error, saving, onClose, onPublish }: {
  pluginPackage: PluginPackage;
  version: PluginVersion;
  sourceVersionId?: string;
  error?: string;
  saving: boolean;
  onClose: () => void;
  onPublish: (upgrade?: PluginPublishRequest) => void;
}) {
  const sources = pluginPackage.versions.filter(item => item.id !== version.id && item.status === 'PUBLISHED'
    && pluginPackage.assignments.some(rule => rule.pluginVersionId === item.id && rule.status === 'ACTIVE' && rule.desiredState === 'INSTALLED'));
  const [sourceVersionId, setSourceVersionId] = useState(preferredSource !== undefined
    ? sources.find(source => source.id === preferredSource)?.id ?? '' : sources[0]?.id ?? '');
  const count = pluginPackage.assignments.filter(rule => rule.pluginVersionId === sourceVersionId && rule.status === 'ACTIVE' && rule.desiredState === 'INSTALLED').length;
  return <ProductDialog title="发布插件版本" onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); onPublish(sourceVersionId ? { sourceVersionId, packageRevision: pluginPackage.revision } : undefined); }}>
      <div className="grid gap-4 p-5 text-[13px] text-ink-2">
        <p className="m-0">发布 <strong className="text-ink">{version.installation.displayName} v{version.version}</strong></p>
        {sources.length ? <label className="grid gap-1.5 text-[12.5px] font-medium">
          可见范围
          <select className={inputClass} value={sourceVersionId} disabled={saving} onChange={event => setSourceVersionId(event.target.value)}>
            {sources.map(source => <option key={source.id} value={source.id}>沿用 v{source.version} 的可见范围</option>)}
            <option value="">仅发布，稍后配置可见范围</option>
          </select>
        </label> : null}
        <p className="m-0 text-[12px] text-ink-3">{sourceVersionId
          ? `将所选旧版的 ${count} 条可见范围切换至新版，员工刷新插件目录后可自主更新。撤回规则和其他版本的范围保持不变。`
          : '发布后需在“可见范围”中分配此版本，员工才能看到并安装。'}</p>
        {error ? <p role="alert" className="m-0 text-[12.5px] text-red">{error}</p> : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
        <Button type="button" size="sm" disabled={saving} onClick={onClose}>取消</Button>
        <Button type="submit" variant="primary" size="sm" disabled={saving}>{saving ? '发布中' : sourceVersionId ? '发布并更新范围' : '确认发布'}</Button>
      </footer>
    </form>
  </ProductDialog>;
}

export function PluginAssignmentDialog({
  error,
  onClose,
  onSave,
  packages,
  saving
}: {
  error?: string;
  onClose: () => void;
  onSave: (value: PluginAssignmentValue) => void;
  packages: ReadonlyArray<PluginPackage>;
  saving: boolean;
}) {
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '');
  const [items, setItems] = useState<ProductAssignment[]>(packages[0] ? editableAssignments(packages[0]) : []);
  const [validationError, setValidationError] = useState<string>();
  const pluginPackage = packages.find((item) => item.id === packageId);
  const publishedVersions = pluginPackage?.versions.filter((version) => version.status === 'PUBLISHED') ?? [];

  const selectPackage = (nextPackageId: string) => {
    const nextPackage = packages.find((item) => item.id === nextPackageId);
    setPackageId(nextPackageId);
    setItems(nextPackage ? editableAssignments(nextPackage) : []);
    setValidationError(undefined);
  };
  const updateItem = (index: number, patch: Partial<ProductAssignment>) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };
  const addItem = () => {
    const version = publishedVersions[0];
    if (!version) {
      setValidationError('请先发布一个插件版本');
      return;
    }
    setItems((current) => [...current, {
      pluginVersionId: version.id,
      subjectType: current.some((item) => item.subjectType === 'ALL') ? 'USER' : 'ALL',
      subjectId: null,
      desiredState: 'INSTALLED',
      required: false
    }]);
    setValidationError(undefined);
  };
  const submit = () => {
    if (!pluginPackage) return;
    if (items.some((item) => !publishedVersions.some((version) => version.id === item.pluginVersionId))) {
      setValidationError('每条分配必须选择已发布版本');
      return;
    }
    if (items.some((item) => item.subjectType === 'USER' && !item.subjectId)) {
      setValidationError('请选择成员');
      return;
    }
    const subjects = items.map((item) => `${item.subjectType}:${item.subjectId ?? ''}`);
    if (new Set(subjects).size !== subjects.length) {
      setValidationError('同一分配对象只能存在一条规则');
      return;
    }
    setValidationError(undefined);
    onSave({
      packageId: pluginPackage.id,
      revision: pluginPackage.revision,
      items: items.map((item) => ({
        ...item,
        subjectId: item.subjectType === 'ALL' ? null : item.subjectId,
        required: false
      }))
    });
  };

  return (
    <ProductDialog title="配置可见范围" onClose={onClose}>
      <div className="grid gap-4 p-5">
        <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
          插件
          <select className={inputClass} value={packageId} onChange={(event) => selectPackage(event.target.value)}>
            {packages.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
          </select>
        </label>
        <div className="grid gap-3">
          {items.map((item, index) => (
            <div key={`${item.subjectType}:${item.subjectId ?? 'all'}:${index}`} className="grid gap-3 border-b border-line pb-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                版本
                <select className={inputClass} value={item.pluginVersionId} onChange={(event) => updateItem(index, { pluginVersionId: event.target.value })}>
                  {pluginPackage?.versions.map((version) => (
                    <option key={version.id} value={version.id} disabled={version.status !== 'PUBLISHED'}>
                      {version.version}{version.status !== 'PUBLISHED' ? ' - 未发布' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                可见成员
                <select
                  className={inputClass}
                  value={item.subjectType}
                  onChange={(event) => updateItem(index, {
                    subjectType: event.target.value as ProductAssignment['subjectType'],
                    subjectId: null
                  })}
                >
                  <option value="ALL">所有成员</option>
                  <option value="USER">指定成员</option>
                </select>
              </label>
              {item.subjectType === 'USER' ? (
                <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                  成员
                  <MemberSelect value={item.subjectId ?? ''} onValueChange={(subjectId) => updateItem(index, { subjectId })} />
                </label>
              ) : <div />}
              <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
                可用状态
                <select
                  className={inputClass}
                  value={item.desiredState}
                  onChange={(event) => {
                    const desiredState = event.target.value as ProductAssignment['desiredState'];
                    updateItem(index, { desiredState, ...(desiredState === 'ABSENT' ? { required: false } : {}) });
                  }}
                >
                  <option value="INSTALLED">可见，用户自主安装</option>
                  <option value="ABSENT">撤回并移除已安装插件</option>
                </select>
              </label>
              <div className="flex items-end justify-end">
                <Button type="button" variant="quiet" size="xs" className="size-8 rounded-md p-0 text-red" aria-label={`删除分配 ${index + 1}`} title="删除" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  <Trash2 aria-hidden className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" size="sm" disabled={!pluginPackage || items.length >= 200} onClick={addItem}>
            <Plus aria-hidden className="size-3.5" />
            添加范围
          </Button>
        </div>
        {validationError || error ? <p role="alert" className="m-0 text-[12.5px] text-red">{validationError ?? error}</p> : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
        <Button type="button" size="sm" onClick={onClose}>取消</Button>
        <Button type="button" variant="primary" size="sm" disabled={saving || !pluginPackage} onClick={submit}>{saving ? '保存中' : '保存范围'}</Button>
      </footer>
    </ProductDialog>
  );
}

export function RetirePluginVersionDialog({
  error,
  onClose,
  onConfirm,
  saving,
  version
}: {
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
  version: PluginVersion;
}) {
  return (
    <ProductDialog title="退休插件版本" onClose={onClose}>
      <div className="grid gap-3 p-5 text-[13px] text-ink-2">
        <p className="m-0">确认退休 <strong className="text-ink">{version.packageName}@{version.version}</strong>？</p>
        {error ? <p role="alert" className="m-0 text-[12.5px] text-red">{error}</p> : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
        <Button type="button" size="sm" onClick={onClose}>取消</Button>
        <Button type="button" variant="primary" size="sm" disabled={saving} onClick={onConfirm}>{saving ? '处理中' : '确认退休'}</Button>
      </footer>
    </ProductDialog>
  );
}
