/**
 * [INPUT]: 依赖 React、共享 MemberSelect、ProductDialog、PluginCategorySelect、插件 DTO 与 coss UI Button/Input/Select/Collapsible/Field/Alert。
 * [OUTPUT]: 提供首次登记、锁定包名并继承资料的新增版本、发布并沿用指定旧版范围、范围编辑和退休确认；员工仍自主安装。
 * [POS]: features/plugins 的写入表单层，只收集产品语义，不解析包或执行安装命令，也不持有 mutation。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type {
  PluginAssignmentWrite,
  PluginEngines,
  PluginMarketMetadata,
  PluginPackage,
  PluginPublishRequest,
  PluginRegistrationRequest,
  PluginSource,
  PluginVersion
} from '@/api/generated/types.gen';
import { ConfirmDialog } from '@/components/product/ConfirmDialog';
import { ProductDialog } from '@/components/product/Dialog';
import { DialogFooter } from '@/components/product/DialogFooter';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardPanel } from '@/components/ui/card';
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MemberSelect } from '@/features/member-select';
import { PluginCategorySelect } from './plugin-category-select';

type LegacyPluginRegistrationValue = Omit<PluginRegistrationRequest, 'metadata' | 'source' | 'engines'> & {
  metadata?: PluginRegistrationRequest['metadata'];
  source?: PluginRegistrationRequest['source'];
  engines?: PluginRegistrationRequest['engines'];
};

export type PluginRegistrationValue = LegacyPluginRegistrationValue;

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

export function registrationValue(values: Record<string, string>, category = ''): PluginRegistrationValue {
  const packageName = (values.packageName ?? '').trim();
  const version = (values.version ?? '').trim();
  const sourceType = values.sourceType === 'git' ? 'git' : 'npm';
  const metadata: PluginMarketMetadata = {
    title: (values.displayName ?? '').trim() || packageName,
    description: (values.description ?? '').trim(),
    icon: (values.icon ?? '').trim(),
    author: (values.author ?? '').trim(),
    homepage: (values.homepage ?? '').trim(),
    repositoryUrl: (values.repositoryUrl ?? '').trim(),
    repositoryDirectory: (values.repositoryDirectory ?? '').trim(),
    category: category.trim(),
    keywords: (values.keywords ?? '').split(',').map(value => value.trim()).filter(Boolean),
    labels: (values.labels ?? '').split(',').map(value => value.trim()).filter(Boolean),
    sortKeys: {}
  };
  const source: PluginSource = sourceType === 'git'
    ? { type: 'git', url: (values.sourceUrl ?? '').trim(), commit: (values.commit ?? '').trim(), ...(values.sourcePath?.trim() ? { path: values.sourcePath.trim() } : {}) }
    : { type: 'npm', ...(values.registry?.trim() ? { registry: values.registry.trim() } : {}) };
  const engines: PluginEngines = values.dshRange?.trim() ? { dsh: values.dshRange.trim() } : {};
  if (values.sourceType === undefined) {
    return {
      packageName,
      version,
      installation: {
        spec: `${packageName}@${version}`,
        displayName: metadata.title,
        description: metadata.description,
        author: metadata.author,
        repositoryUrl: metadata.repositoryUrl,
        category: category.trim()
      }
    };
  }
  return {
    packageName,
    version,
    metadata,
    source,
    engines,
    installation: {
      spec: source.type === 'npm' ? `${packageName}@${version}` : `${source.url}#${source.commit}`,
      displayName: metadata.title,
      description: metadata.description,
      author: metadata.author,
      repositoryUrl: metadata.repositoryUrl,
      category: category.trim()
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!baseVersion) return {} as Record<string, string>;
    const metadata = {
      title: baseVersion.installation.displayName,
      description: baseVersion.installation.description,
      icon: '', author: baseVersion.installation.author, homepage: '',
      repositoryUrl: baseVersion.installation.repositoryUrl, repositoryDirectory: '',
      category: baseVersion.installation.category, keywords: [], labels: [], sortKeys: {}
    };
    const source = baseVersion.source ?? { type: 'npm' as const };
    return {
      displayName: metadata.title, description: metadata.description, icon: metadata.icon,
      author: metadata.author, homepage: metadata.homepage, repositoryUrl: metadata.repositoryUrl,
      repositoryDirectory: metadata.repositoryDirectory, keywords: metadata.keywords.join(', '),
      labels: metadata.labels.join(', '),
      registry: source.type === 'npm' ? source.registry ?? '' : '',
      sourceUrl: source.type === 'git' ? source.url : '', commit: source.type === 'git' ? source.commit : '',
      sourcePath: source.type === 'git' ? source.path ?? '' : '', dshRange: baseVersion.engines?.dsh ?? '',
      packageName: baseVersion.packageName, version: ''
    };
  });
  const [category, setCategory] = useState(baseVersion?.installation.category ?? '');
  const [validationError, setValidationError] = useState<string>();
  const fields = [
    ['packageName', '包名', '@company/dsh-plugin', true, 214],
    ['version', '版本', '1.0.0', true, 64],
    ['description', '简介', '这个插件能做什么', false, 2000],
    ['displayName', '标题', '代码审查', false, 120],
    ['author', '作者', 'OwnDsh', false, 120],
    ['homepage', '主页', 'https://example.com/plugin', false, 4096],
    ['repositoryUrl', '仓库地址', 'https://github.com/example/plugin', false, 4096],
    ['repositoryDirectory', '仓库目录', 'packages/plugin', false, 256],
    ['icon', '图标 URL', 'https://example.com/icon.png', false, 4096],
    ['keywords', '关键词', 'review, code', false, 8000],
    ['labels', '标签', '官方, 推荐', false, 8000],
    ['registry', 'npm Registry', 'https://registry.npmjs.org', false, 4096],
    ['sourceUrl', 'Git 仓库地址', 'https://github.com/example/plugin', false, 4096],
    ['commit', 'Git Commit', '40 位小写 SHA-1', false, 40],
    ['sourcePath', 'Git 包目录', 'packages/plugin', false, 256],
    ['dshRange', 'DSH 兼容范围', '>=0.2.1-rc.2', false, 128],
  ] as const;

  const renderField = ([key, label, placeholder, required, maxLength]: typeof fields[number]) => (
    <Field key={key}>
      <FieldLabel>{label}</FieldLabel>
      <Input
        name={key}
        required={required}
        maxLength={maxLength}
        disabled={saving}
        readOnly={Boolean(baseVersion) && key === 'packageName'}
        autoFocus={Boolean(baseVersion) && key === 'version'}
        type="text"
        placeholder={placeholder}
        value={values[key] ?? ''}
        onChange={event => {
          setValidationError(undefined);
          setValues(current => ({ ...current, [key]: event.target.value }));
        }}
      />
    </Field>
  );

  const sourceItems = [
    { value: 'npm', label: 'npm' },
    { value: 'git', label: 'Git 固定 Commit' }
  ];

  const metadata = (
    <>
      {fields.slice(2, 3).map(renderField)}
      {!showAdvanced ? (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="justify-self-start px-0"
          onClick={() => {
            setShowAdvanced(true);
            setValues(current => ({ ...current, sourceType: current.sourceType ?? (baseVersion?.source?.type ?? 'npm') }));
          }}
        >
          添加更多市场资料
        </Button>
      ) : null}
      {showAdvanced ? (
        <>
          {fields.slice(3, 11).map(renderField)}
          <Field>
            <FieldLabel>安装来源</FieldLabel>
            <Select
              items={sourceItems}
              value={values.sourceType ?? 'npm'}
              disabled={saving}
              onValueChange={next => {
                if (!next) return;
                setValidationError(undefined);
                setValues(current => ({ ...current, sourceType: next }));
              }}
            >
              <SelectTrigger aria-label="安装来源">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {sourceItems.map(item => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
          {(values.sourceType ?? 'npm') === 'npm' ? fields.slice(11, 12).map(renderField) : fields.slice(12, 15).map(renderField)}
          {fields.slice(15).map(renderField)}
        </>
      ) : null}
      <PluginCategorySelect options={categoryOptions} value={category} onChange={setCategory} disabled={saving} />
      {categoriesLoading ? <p role="status" className="m-0 text-xs text-muted-foreground">正在加载已有分类…</p> : null}
      {categoriesError ? (
        <Alert variant="error">
          <AlertDescription className="flex items-center gap-2">
            <span>已有分类加载失败。</span>
            <Button type="button" variant="link" size="xs" className="h-auto p-0" onClick={onRetryCategories}>重试</Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );

  return (
    <ProductDialog title={baseVersion ? '新增版本' : '添加插件'} onClose={onClose}>
      <form
        onSubmit={event => {
          event.preventDefault();
          const value = registrationValue({ ...values, ...(baseVersion ? { packageName: baseVersion.packageName } : {}) }, category);
          if (baseVersion && (value.version === baseVersion.version || versions.some(item => item.version === value.version))) {
            setValidationError('这个版本已存在，请填写新的版本号。');
            return;
          }
          onSave(value);
        }}
      >
        <div className="grid gap-4 p-5">
          {baseVersion ? (
            <p className="m-0 text-xs text-muted-foreground">基于 {baseVersion.installation.displayName} v{baseVersion.version}，已沿用插件资料。</p>
          ) : null}
          {fields.slice(0, 2).map(renderField)}
          {baseVersion ? (
            <Collapsible defaultOpen className="rounded-lg border p-3">
              <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between text-xs font-medium text-foreground">
                <span>插件资料 · 已沿用，按需修改</span>
                <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
              </CollapsibleTrigger>
              <CollapsiblePanel>
                <div className="mt-4 grid gap-4">{metadata}</div>
              </CollapsiblePanel>
            </Collapsible>
          ) : metadata}
          {validationError || error ? (
            <Alert variant="error">
              <AlertDescription>{validationError ?? error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button type="submit" size="sm" disabled={saving}>{saving ? '保存中' : '保存版本'}</Button>
        </DialogFooter>
      </form>
    </ProductDialog>
  );
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
  const scopeItems = [
    ...sources.map(source => ({ value: source.id, label: `沿用 v${source.version} 的可见范围` })),
    { value: '', label: '仅发布，稍后配置可见范围' }
  ];

  return (
    <ProductDialog title="发布插件版本" onClose={onClose}>
      <form onSubmit={event => { event.preventDefault(); onPublish(sourceVersionId ? { sourceVersionId, packageRevision: pluginPackage.revision } : undefined); }}>
        <div className="grid gap-4 p-5 text-sm text-muted-foreground">
          <p className="m-0">发布 <strong className="text-foreground">{version.installation.displayName} v{version.version}</strong></p>
          {sources.length ? (
            <Field>
              <FieldLabel>可见范围</FieldLabel>
              <Select items={scopeItems} value={sourceVersionId} disabled={saving} onValueChange={next => setSourceVersionId(next ?? '')}>
                <SelectTrigger aria-label="可见范围">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {scopeItems.map(item => (
                    <SelectItem key={item.value || '__none__'} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>
          ) : null}
          <p className="m-0 text-xs text-muted-foreground">
            {sourceVersionId
              ? `将所选旧版的 ${count} 条可见范围切换至新版，员工刷新插件目录后可自主更新。撤回规则和其他版本的范围保持不变。`
              : '发布后需在“可见范围”中分配此版本，员工才能看到并安装。'}
          </p>
          {error ? (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onClose}>取消</Button>
          <Button type="submit" size="sm" disabled={saving}>{saving ? '发布中' : sourceVersionId ? '发布并更新范围' : '确认发布'}</Button>
        </DialogFooter>
      </form>
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
        required: false
      }))
    });
  };

  const packageItems = packages.map((item) => ({ value: item.id, label: item.displayName }));
  const versionItems = (pluginPackage?.versions ?? []).map((version) => ({
    value: version.id,
    label: `${version.version}${version.status !== 'PUBLISHED' ? ' - 未发布' : ''}`,
    disabled: version.status !== 'PUBLISHED'
  }));
  const subjectTypeItems = [
    { value: 'ALL', label: '所有成员' },
    { value: 'USER', label: '指定成员' }
  ];
  const desiredStateItems = [
    { value: 'INSTALLED', label: '可见，用户自主安装' },
    { value: 'ABSENT', label: '撤回并移除已安装插件' }
  ];

  return (
    <ProductDialog title="配置可见范围" onClose={onClose}>
      <div className="grid gap-4 p-5">
        <Field>
          <FieldLabel>插件</FieldLabel>
          <Select items={packageItems} value={packageId} onValueChange={(next) => { if (next) selectPackage(next); }}>
            <SelectTrigger aria-label="插件">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {packageItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Field>
        <div className="grid gap-3">
          {items.map((item, index) => (
            <Card key={`${item.subjectType}:${item.subjectId ?? 'all'}:${index}`}>
              <CardPanel className="grid gap-3 p-3.5 sm:grid-cols-2">
                <Field>
                  <FieldLabel>版本</FieldLabel>
                  <Select items={versionItems} value={item.pluginVersionId} onValueChange={(next) => { if (next) updateItem(index, { pluginVersionId: next }); }}>
                    <SelectTrigger aria-label="版本">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      {versionItems.map((version) => (
                        <SelectItem key={version.value} value={version.value} disabled={version.disabled}>
                          {version.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>可见成员</FieldLabel>
                  <Select
                    items={subjectTypeItems}
                    value={item.subjectType}
                    onValueChange={(next) => {
                      if (!next) return;
                      updateItem(index, {
                        subjectType: next as ProductAssignment['subjectType'],
                        subjectId: null
                      });
                    }}
                  >
                    <SelectTrigger aria-label="可见成员">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      {subjectTypeItems.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </Field>
                {item.subjectType === 'USER' ? (
                  <Field>
                    <FieldLabel>成员</FieldLabel>
                    <MemberSelect aria-label="成员" value={item.subjectId ?? ''} onValueChange={(subjectId) => updateItem(index, { subjectId })} />
                  </Field>
                ) : <div />}
                <Field>
                  <FieldLabel>可用状态</FieldLabel>
                  <Select
                    items={desiredStateItems}
                    value={item.desiredState}
                    onValueChange={(next) => {
                      if (!next) return;
                      const desiredState = next as ProductAssignment['desiredState'];
                      updateItem(index, { desiredState, ...(desiredState === 'ABSENT' ? { required: false } : {}) });
                    }}
                  >
                    <SelectTrigger aria-label="可用状态">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      {desiredStateItems.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </Field>
                <div className="flex items-end justify-end sm:col-span-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive-foreground"
                    aria-label={`删除分配 ${index + 1}`}
                    title="删除"
                    onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </CardPanel>
            </Card>
          ))}
          <Button type="button" variant="outline" size="sm" disabled={!pluginPackage || items.length >= 200} onClick={addItem}>
            <Plus aria-hidden />
            添加范围
          </Button>
        </div>
        {validationError || error ? (
          <Alert variant="error">
            <AlertDescription>{validationError ?? error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>取消</Button>
        <Button type="button" size="sm" disabled={saving || !pluginPackage} onClick={submit}>{saving ? '保存中' : '保存范围'}</Button>
      </DialogFooter>
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
    <ConfirmDialog
      title="退休插件版本"
      description={<>确认退休 <strong className="text-foreground">{version.packageName}@{version.version}</strong>？</>}
      confirmLabel="确认退休"
      confirmVariant="default"
      saving={saving}
      error={error}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
