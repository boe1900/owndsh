/**
 * [INPUT]: 依赖 React、共享 MemberSelect、ProductDialog、插件 DTO 与浏览器原生表单控件。
 * [OUTPUT]: 提供插件 tgz 上传、ALL/USER 分配编辑和版本退休确认对话框。
 * [POS]: features/plugins 的写入表单层，只收集产品语义，不解析 tgz、不签名也不持有 mutation。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type {
  PluginAssignmentWrite,
  PluginCompatibility,
  PluginOperatingSystem,
  PluginPackage,
  PluginVersion
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { ProductDialog } from '@/components/product/Dialog';
import { MemberSelect } from '@/features/member-select';

const LOCKED_HARNESS_COMMIT = 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e';
const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;
const OPERATING_SYSTEMS: ReadonlyArray<{ label: string; value: PluginOperatingSystem }> = [
  { label: 'macOS', value: 'darwin' },
  { label: 'Linux', value: 'linux' },
  { label: 'Windows', value: 'win32' }
];
const inputClass = 'h-9 w-full rounded-lg border border-line bg-canvas px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-tint';

export type PluginUploadValue = {
  artifact: File;
  compatibility: PluginCompatibility;
};

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
      required: assignment.required
    }));
}

export function parseHarnessCommits(value: string) {
  return [...new Set(value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))];
}

export function UploadPluginVersionDialog({
  error,
  onClose,
  onSave,
  saving
}: {
  error?: string;
  onClose: () => void;
  onSave: (value: PluginUploadValue) => void;
  saving: boolean;
}) {
  const [artifact, setArtifact] = useState<File>();
  const [harnessCommits, setHarnessCommits] = useState(LOCKED_HARNESS_COMMIT);
  const [enterpriseBundleRange, setEnterpriseBundleRange] = useState('>=0.1.0 <0.2.0');
  const [operatingSystems, setOperatingSystems] = useState<PluginOperatingSystem[]>(['darwin', 'linux', 'win32']);
  const [validationError, setValidationError] = useState<string>();

  const submit = () => {
    if (!artifact || !artifact.name.endsWith('.tgz')) {
      setValidationError('请选择 .tgz 插件包');
      return;
    }
    if (artifact.size > MAX_ARTIFACT_BYTES) {
      setValidationError('插件包不能超过 50 MiB');
      return;
    }
    const commits = parseHarnessCommits(harnessCommits);
    if (commits.length === 0 || commits.length > 20 || commits.some((commit) => !/^[0-9a-f]{40}$/.test(commit))) {
      setValidationError('Harness commit 必须是 1-20 个完整小写 commit');
      return;
    }
    if (!enterpriseBundleRange.trim()) {
      setValidationError('Bundle 版本范围不能为空');
      return;
    }
    if (operatingSystems.length === 0) {
      setValidationError('至少选择一个操作系统');
      return;
    }
    setValidationError(undefined);
    onSave({
      artifact,
      compatibility: {
        harnessCommits: commits,
        enterpriseBundleRange: enterpriseBundleRange.trim(),
        operatingSystems
      }
    });
  };

  return (
    <ProductDialog title="上传插件版本" onClose={onClose}>
      <div className="grid gap-4 p-5">
        <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
          插件包
          <input
            type="file"
            accept=".tgz,application/gzip"
            className="block w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[12.5px] text-ink file:mr-3 file:rounded-md file:border-0 file:bg-inset file:px-2.5 file:py-1 file:text-[12px] file:text-ink-2"
            onChange={(event) => setArtifact(event.target.files?.[0])}
          />
        </label>
        <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
          Harness commits
          <textarea
            className={`${inputClass} min-h-20 resize-y py-2 font-mono text-[12px]`}
            value={harnessCommits}
            onChange={(event) => setHarnessCommits(event.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">
          Bundle 版本范围
          <input className={inputClass} value={enterpriseBundleRange} onChange={(event) => setEnterpriseBundleRange(event.target.value)} />
        </label>
        <fieldset className="grid gap-2">
          <legend className="text-[12.5px] font-medium text-ink-2">操作系统</legend>
          <div className="flex flex-wrap gap-4">
            {OPERATING_SYSTEMS.map((system) => (
              <label key={system.value} className="flex items-center gap-2 text-[13px] text-ink-2">
                <input
                  type="checkbox"
                  checked={operatingSystems.includes(system.value)}
                  onChange={(event) => setOperatingSystems((current) => event.target.checked
                    ? [...current, system.value]
                    : current.filter((value) => value !== system.value))}
                />
                {system.label}
              </label>
            ))}
          </div>
        </fieldset>
        {validationError || error ? <p role="alert" className="m-0 text-[12.5px] text-red">{validationError ?? error}</p> : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
        <Button type="button" size="sm" onClick={onClose}>取消</Button>
        <Button type="button" variant="primary" size="sm" disabled={saving} onClick={submit}>{saving ? '上传中' : '上传并验证'}</Button>
      </footer>
    </ProductDialog>
  );
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
        required: item.desiredState === 'ABSENT' ? false : item.required
      }))
    });
  };

  return (
    <ProductDialog title="配置插件分配" onClose={onClose}>
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
                分配对象
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
                期望状态
                <select
                  className={inputClass}
                  value={item.desiredState}
                  onChange={(event) => {
                    const desiredState = event.target.value as ProductAssignment['desiredState'];
                    updateItem(index, { desiredState, ...(desiredState === 'ABSENT' ? { required: false } : {}) });
                  }}
                >
                  <option value="INSTALLED">安装</option>
                  <option value="ABSENT">移除</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
                <input
                  type="checkbox"
                  checked={item.required}
                  disabled={item.desiredState === 'ABSENT'}
                  onChange={(event) => updateItem(index, { required: event.target.checked })}
                />
                强制安装
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
            添加分配
          </Button>
        </div>
        {validationError || error ? <p role="alert" className="m-0 text-[12.5px] text-red">{validationError ?? error}</p> : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-line px-5 py-4">
        <Button type="button" size="sm" onClick={onClose}>取消</Button>
        <Button type="button" variant="primary" size="sm" disabled={saving || !pluginPackage} onClick={submit}>{saving ? '保存中' : '保存分配'}</Button>
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
