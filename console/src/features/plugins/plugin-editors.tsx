/**
 * [INPUT]: 依赖 React、共享 MemberSelect、ProductDialog、PluginCategorySelect、插件 DTO 与浏览器原生表单控件。
 * [OUTPUT]: 提供插件安装目标与展示信息登记、ALL/USER 企业可见范围编辑和版本退休确认对话框；发布不强制安装。
 * [POS]: features/plugins 的写入表单层，只收集产品语义，不解析包或执行安装命令，也不持有 mutation。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type {
  PluginAssignmentWrite,
  PluginRegistrationRequest,
  PluginPackage,
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

export function RegisterPluginVersionDialog({ categoryOptions, categoriesLoading, categoriesError, onRetryCategories, error, onClose, onSave, saving }: {
  categoryOptions: string[];
  categoriesLoading: boolean;
  categoriesError: boolean;
  onRetryCategories: () => void;
  error?: string;
  onClose: () => void;
  onSave: (value: PluginRegistrationValue) => void;
  saving: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<string[]>([]);
  const fields = [
    ['packageName', '包名', '@company/dsh-plugin', true, 214],
    ['version', '版本', '1.0.0', true, 64],
    ['spec', '安装目标', '留空使用包名@版本，或填写 Git / .tgz 地址 / 客户端绝对路径', false, 2048],
    ['displayName', '显示名称', '留空使用包名', false, 120],
    ['description', '简介', '这个插件能做什么', false, 2000],
    ['author', '作者', '团队或作者名称', false, 120],
    ['repositoryUrl', '源码仓库', 'https://github.com/company/plugin', false, 2048]
  ] as const;
  return <ProductDialog title="添加插件版本" onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); onSave(registrationValue(values, categories)); }}>
      <div className="grid gap-4 p-5">
        {fields.map(([key, label, placeholder, required, maxLength]) => <label key={key} className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
          {label}
          <input className={inputClass} name={key} required={required} maxLength={maxLength}
            type={key === 'repositoryUrl' ? 'url' : 'text'} placeholder={placeholder}
            value={values[key] ?? ''} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} />
        </label>)}
        <PluginCategorySelect options={categoryOptions} value={categories} onChange={setCategories} disabled={saving} />
        {categoriesLoading ? <p role="status" className="m-0 text-[12px] text-ink-3">正在加载已有分类…</p> : null}
        {categoriesError ? <p role="alert" className="m-0 text-[12px] text-red">已有分类加载失败。<button type="button" className="ml-1 underline" onClick={onRetryCategories}>重试</button></p> : null}
        <p className="m-0 text-[12px] text-ink-3">Git 格式：github:组织/仓库#完整 commit，可追加 &amp;path:/子目录。包地址由员工客户端访问；私有源使用宿主已有的认证配置。</p>
        {error ? <p role="alert" className="m-0 text-[12.5px] text-red">{error}</p> : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
        <Button type="button" size="sm" onClick={onClose}>取消</Button>
        <Button type="submit" variant="primary" size="sm" disabled={saving}>{saving ? '保存中' : '保存版本'}</Button>
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
