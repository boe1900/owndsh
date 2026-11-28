/**
 * [INPUT]: 依赖 skill admin OpenAPI、ProductDataTable、ProductDialog 与 coss UI Button/Badge/Input/Textarea/Select/Field/Alert/Card。
 * [OUTPUT]: 提供公开/私有 Skill 导入、真实预检草稿与导入后立即发布、凭据管理、发布/撤销、版本历史内发布/回滚工作台。
 * [POS]: features/skills 的管理端纵向页面；员工端只消费已发布当前版本。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Globe2, History, KeyRound, LockKeyhole, PackageOpen, Plus, RotateCcw, Send, ShieldCheck, ShieldOff, Undo2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { createSkillSourceCredential, importSkillRelease, listSkillReleases, listSkillSourceCredentials, publishSkillRelease, revokeSkillRelease, revokeSkillSourceCredential, rotateSkillSourceCredential } from '@/api/generated/sdk.gen';
import type { EnterpriseErrorResponse, SkillRelease, SkillSourceCredential, SkillSourceCredentialWriteRequestWritable, SkillSourceImportRequest } from '@/api/generated/types.gen';
import { ConfirmDialog } from '@/components/product/ConfirmDialog';
import {
  ProductDataTable,
  TableStackCell,
  TableStatusBadge,
  type ProductTableColumn
} from '@/components/product/DataTable';
import { ProductDialog } from '@/components/product/Dialog';
import { DialogFooter } from '@/components/product/DialogFooter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardPanel } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const monoClass = 'font-mono text-[11px]';

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'error' in error) {
    const payload = (error as EnterpriseErrorResponse).error;
    if (payload?.message) return payload.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

async function loadReleases(): Promise<SkillRelease[]> {
  const read = async (cursor?: string): Promise<SkillRelease[]> => {
    const result = await listSkillReleases({ query: { limit: 200, ...(cursor ? { cursor } : {}) } });
    const page = result.data?.data;
    if (result.error !== undefined || !page || !Array.isArray(page.items) || !page.page) throw new Error(errorMessage(result.error, '技能目录加载失败'));
    return page.page.hasMore && page.page.nextCursor ? [...page.items, ...await read(page.page.nextCursor)] : page.items;
  };
  return read();
}

async function loadCredentials(): Promise<SkillSourceCredential[]> {
  const result = await listSkillSourceCredentials();
  const data = result.data?.data;
  if (result.error !== undefined || !Array.isArray(data)) throw new Error(errorMessage(result.error, '凭据加载失败'));
  return data;
}

function statusLabel(status: SkillRelease['status']) {
  return status === 'PUBLISHED'
    ? ['已发布', 'success'] as const
    : status === 'REVOKED'
      ? ['已撤销', 'secondary'] as const
      : ['待发布', 'info'] as const;
}

function credentialLabel(value: SkillSourceCredential) {
  return `${value.name} · ${value.tokenHint}`;
}

function repositoryBase(value?: SkillRelease) {
  const url = value?.repositoryUrl ?? '';
  const commit = value?.resolvedCommit;
  return commit ? url.replace(new RegExp(`/(?:-/)?tree/${commit}(?:/.*)?$`), '') : url;
}

function ImportDialog({ credentials, error, saving, preview, prefill, onClose, onSave, onPublish, onCredentialsChanged }: {
  credentials: SkillSourceCredential[]; error?: string; saving: boolean; preview?: SkillRelease; prefill?: SkillRelease;
  onClose: () => void; onSave: (value: SkillSourceImportRequest) => void; onPublish: (release: SkillRelease) => void; onCredentialsChanged: () => void;
}) {
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>(prefill?.credentialId ? 'PRIVATE' : 'PUBLIC');
  const [value, setValue] = useState({ repositoryUrl: repositoryBase(prefill), revision: '', credentialId: prefill?.credentialId ?? '', releaseNotes: '' });
  const [addingCredential, setAddingCredential] = useState(false);
  const [newCredential, setNewCredential] = useState({ name: '', token: '' });
  const credentialMutation = useMutation({
    mutationFn: async (body: SkillSourceCredentialWriteRequestWritable) => {
      const result = await createSkillSourceCredential({ body });
      if (result.error || !result.data?.data) throw new Error(errorMessage(result.error, '凭据保存失败'));
      return result.data.data;
    },
    onSuccess: created => {
      setValue(current => ({ ...current, credentialId: created.id }));
      setNewCredential({ name: '', token: '' });
      setAddingCredential(false);
      onCredentialsChanged();
    }
  });
  const set = (key: keyof typeof value, next: string) => setValue(current => ({ ...current, [key]: next }));

  if (preview) {
    return (
      <ProductDialog title="导入完成 · 草稿已创建" onClose={onClose}>
        <div className="grid gap-4 p-5">
          <Alert variant="success">
            <CheckCircle2 aria-hidden />
            <AlertTitle>已真实拉取并校验 SKILL.md</AlertTitle>
            <AlertDescription>
              <div className="mt-2 grid gap-1 text-foreground">
                <div>技能：<b>{preview.name}</b> · v{preview.version}</div>
                <div>Commit：<span className={monoClass}>{preview.resolvedCommit}</span></div>
                <div>SHA-256：<span className={monoClass}>{preview.artifactSha256}</span></div>
                <div>大小：{Math.round(preview.artifactSizeBytes / 1024)} KB · 状态：待发布</div>
              </div>
            </AlertDescription>
          </Alert>
          <p className="m-0 text-xs text-muted-foreground">草稿已进入目录。发布后才会对员工端可见。</p>
          <DialogFooter sticky>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>稍后发布</Button>
            <Button type="button" size="sm" onClick={() => onPublish(preview)}>立即发布</Button>
          </DialogFooter>
        </div>
      </ProductDialog>
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({
      repositoryUrl: value.repositoryUrl.trim(),
      revision: value.revision.trim(),
      visibility,
      credentialId: visibility === 'PRIVATE' ? value.credentialId || null : null,
      releaseNotes: value.releaseNotes.trim()
    });
  }

  function saveCredential() {
    credentialMutation.mutate({ name: newCredential.name.trim(), token: newCredential.token });
  }

  const activeCredentials = credentials.filter(item => item.status === 'ACTIVE');
  const credentialItems = [
    { value: '', label: '选择访问凭据' },
    ...activeCredentials.map(item => ({ value: item.id, label: credentialLabel(item) }))
  ];

  return (
    <ProductDialog title={prefill ? '发布新版本' : '导入技能'} className="max-w-[560px]" onClose={onClose}>
      <form className="grid gap-4 p-5" onSubmit={submit}>
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
          一个仓库对应一个 Skill。服务端会按指定 ref 固定 commit，读取并校验 <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">SKILL.md</code>，解析出的元数据和摘要会在导入后展示。
        </p>
        <Field>
          <FieldLabel>仓库访问类型</FieldLabel>
          <Tabs value={visibility} onValueChange={(next) => setVisibility(next as 'PUBLIC' | 'PRIVATE')} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTab value="PUBLIC">
                <Globe2 aria-hidden className="size-3.5 text-success" />
                公开仓库
              </TabsTab>
              <TabsTab value="PRIVATE">
                <LockKeyhole aria-hidden className="size-3.5 text-warning" />
                私有仓库
              </TabsTab>
            </TabsList>
          </Tabs>
        </Field>
        <Field>
          <FieldLabel>仓库地址</FieldLabel>
          <Input required type="url" placeholder="https://gitlab.corp.com/ai-team/enterprise-skills" value={value.repositoryUrl} onChange={event => set('repositoryUrl', event.target.value)} />
        </Field>
        <div className="grid grid-cols-[130px_1fr] gap-2">
          <Select items={[{ value: 'tag', label: 'Git Tag / Ref' }]} value="tag" onValueChange={() => undefined}>
            <SelectTrigger aria-label="ref 类型">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="tag">Git Tag / Ref</SelectItem>
            </SelectPopup>
          </Select>
          <Input required className="font-mono text-xs" placeholder="v1.2.0 或 commit SHA" value={value.revision} onChange={event => set('revision', event.target.value)} />
        </div>
        {visibility === 'PRIVATE' ? (
          <Card className="border-warning/30 bg-warning/5">
            <CardPanel className="grid gap-3 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <KeyRound className="size-3.5 text-warning" />
                  仓库访问凭据
                </span>
                <Button type="button" variant="ghost" size="xs" onClick={() => setAddingCredential(current => !current)}>
                  <Plus aria-hidden />
                  {addingCredential ? '收起' : '新增凭据'}
                </Button>
              </div>
              {addingCredential ? (
                <div className="grid gap-2 border-t pt-3">
                  <Field>
                    <FieldLabel>备注名称</FieldLabel>
                    <Input required placeholder="内网 GitLab 只读凭据" value={newCredential.name} onChange={event => setNewCredential(current => ({ ...current, name: event.target.value }))} />
                  </Field>
                  <Field>
                    <FieldLabel>Access Token</FieldLabel>
                    <Input required type="password" className="font-mono" value={newCredential.token} onChange={event => setNewCredential(current => ({ ...current, token: event.target.value }))} />
                  </Field>
                  {credentialMutation.error ? (
                    <Alert variant="error">
                      <AlertDescription>{credentialMutation.error.message}</AlertDescription>
                    </Alert>
                  ) : null}
                  <Button type="button" size="sm" disabled={credentialMutation.isPending || !newCredential.name.trim() || !newCredential.token} onClick={saveCredential}>
                    {credentialMutation.isPending ? '保存并选用中' : '保存并选用'}
                  </Button>
                </div>
              ) : (
                <>
                  <Select items={credentialItems} value={value.credentialId} onValueChange={(next) => set('credentialId', next ?? '')}>
                    <SelectTrigger aria-label="访问凭据">
                      <SelectValue placeholder="选择访问凭据" />
                    </SelectTrigger>
                    <SelectPopup>
                      {credentialItems.map(item => (
                        <SelectItem key={item.value || '__empty__'} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                  <p className="m-0 text-[11px] text-muted-foreground">凭据只在服务端加密保存，仓库地址由本次导入决定。</p>
                </>
              )}
            </CardPanel>
          </Card>
        ) : null}
        <Field>
          <FieldLabel>发布说明 <span className="font-normal text-muted-foreground">（可选）</span></FieldLabel>
          <Textarea size="sm" placeholder="记录这次版本变更" value={value.releaseNotes} onChange={event => set('releaseNotes', event.target.value)} />
        </Field>
        {error ? (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-success" />
            会校验真实 Commit、唯一 SKILL.md 和 SHA-256
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>取消</Button>
            <Button type="submit" size="sm" disabled={saving || (visibility === 'PRIVATE' && (!value.credentialId || addingCredential))}>
              {saving ? '校验并导入中' : '预检并创建草稿'}
            </Button>
          </div>
        </div>
      </form>
    </ProductDialog>
  );
}

function CredentialDialog({ credential, onClose, onSaved }: { credential?: SkillSourceCredential; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState({ name: credential?.name ?? '', token: '' });
  const mutation = useMutation({
    mutationFn: async (body: SkillSourceCredentialWriteRequestWritable) => {
      const result = credential
        ? await rotateSkillSourceCredential({ path: { credentialId: credential.id }, headers: { 'If-Match': credential.revision }, body })
        : await createSkillSourceCredential({ body });
      if (result.error) throw new Error(errorMessage(result.error, credential ? '凭据轮换失败' : '凭据保存失败'));
    },
    onSuccess: () => { onSaved(); onClose(); }
  });
  return (
    <ProductDialog title={credential ? '轮换仓库访问凭据' : '新增仓库访问凭据'} onClose={onClose}>
      <form className="grid gap-4 p-5" onSubmit={event => { event.preventDefault(); mutation.mutate({ name: value.name.trim(), token: value.token }); }}>
        <p className="m-0 text-xs text-muted-foreground">只需要能读取仓库的凭据。凭据类型和有效期由 Git 服务商管理，系统只验证实际读取能力。</p>
        <Field>
          <FieldLabel>备注名称</FieldLabel>
          <Input required placeholder="内网 GitLab 只读凭据" value={value.name} onChange={event => setValue(current => ({ ...current, name: event.target.value }))} />
        </Field>
        <Field>
          <FieldLabel>Access Token</FieldLabel>
          <Input required type="password" className="font-mono" value={value.token} onChange={event => setValue(current => ({ ...current, token: event.target.value }))} />
        </Field>
        {mutation.error ? (
          <Alert variant="error">
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter sticky>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button type="submit" size="sm" disabled={mutation.isPending}>{mutation.isPending ? '保存中' : credential ? '轮换并恢复' : '保存凭据'}</Button>
        </DialogFooter>
      </form>
    </ProductDialog>
  );
}

function CredentialManager({ credentials, onClose, onChanged }: { credentials: SkillSourceCredential[]; onClose: () => void; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [rotating, setRotating] = useState<SkillSourceCredential>();
  const [revokeTarget, setRevokeTarget] = useState<SkillSourceCredential>();
  const revoke = useMutation({
    mutationFn: async (credential: SkillSourceCredential) => {
      const result = await revokeSkillSourceCredential({ path: { credentialId: credential.id }, headers: { 'If-Match': credential.revision } });
      if (result.error) throw new Error(errorMessage(result.error, '凭据撤销失败'));
    },
    onSuccess: () => { setRevokeTarget(undefined); onChanged(); }
  });
  if (adding || rotating) return <CredentialDialog credential={rotating} onClose={() => { setAdding(false); setRotating(undefined); }} onSaved={onChanged} />;
  return (
    <>
      {revokeTarget ? (
        <ConfirmDialog
          title="撤销仓库访问凭据"
          description={`确认撤销“${revokeTarget.name}”？撤销后依赖它的私有仓库导入将无法继续。`}
          confirmLabel="撤销凭据"
          saving={revoke.isPending}
          error={revoke.error ? errorMessage(revoke.error, '凭据撤销失败') : undefined}
          onClose={() => { if (!revoke.isPending) setRevokeTarget(undefined); }}
          onConfirm={() => revoke.mutate(revokeTarget)}
        />
      ) : (
        <ProductDialog title={`仓库访问凭据（${credentials.length}）`} onClose={onClose}>
          <div className="grid gap-3 p-5">
            <div className="flex items-center justify-between">
              <p className="m-0 text-xs text-muted-foreground">凭据只用于服务端回源，列表只显示脱敏信息。</p>
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus aria-hidden />
                新增凭据
              </Button>
            </div>
            {credentials.map(item => (
              <Card key={item.id}>
                <CardPanel className="flex items-center justify-between p-3">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold">{item.name}</div>
                    <div className={`${monoClass} mt-1 truncate text-muted-foreground`}>{item.tokenHint}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={item.status === 'ACTIVE' ? 'success' : 'secondary'}>
                      {item.status === 'ACTIVE' ? '正常' : item.status === 'EXPIRED' ? '需轮换' : '已撤销'}
                    </Badge>
                    <Button variant="ghost" size="xs" onClick={() => setRotating(item)}>
                      <RotateCcw aria-hidden />
                      轮换
                    </Button>
                    {item.status !== 'REVOKED' ? (
                      <Button variant="ghost" size="xs" className="text-destructive-foreground" disabled={revoke.isPending} onClick={() => setRevokeTarget(item)}>
                        <ShieldOff aria-hidden />
                        撤销
                      </Button>
                    ) : null}
                  </div>
                </CardPanel>
              </Card>
            ))}
            {credentials.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">还没有仓库访问凭据</div>
            ) : null}
            {revoke.error ? (
              <Alert variant="error">
                <AlertDescription>{revoke.error.message}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </ProductDialog>
      )}
    </>
  );
}

function VersionDialog({ release, releases, onClose, onNewRelease, onPublish, onRollback }: {
  release: SkillRelease; releases: SkillRelease[]; onClose: () => void;
  onNewRelease: (release: SkillRelease) => void; onPublish: (release: SkillRelease) => void; onRollback: (release: SkillRelease) => void;
}) {
  const versions = releases.filter(item => item.name === release.name).sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  function versionAction(item: SkillRelease) {
    if (item.status === 'DRAFT') return <Button variant="ghost" size="xs" className="shrink-0" onClick={() => onPublish(item)}><Send aria-hidden />发布</Button>;
    if (item.status === 'REVOKED') return <Button variant="ghost" size="xs" className="shrink-0" onClick={() => onPublish(item)}><Undo2 aria-hidden />恢复发布</Button>;
    if (!item.current && item.status === 'PUBLISHED') return <Button variant="ghost" size="xs" className="shrink-0" onClick={() => onRollback(item)}><RotateCcw aria-hidden />回滚</Button>;
    return null;
  }
  return (
    <ProductDialog title={`${release.name} · 版本历史`} onClose={onClose}>
      <div className="grid gap-4 p-5">
        <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/50 p-3">
          <div className="min-w-0 text-[11px] leading-relaxed text-muted-foreground">每个版本固定到真实 Commit。发布新版本会切换当前生效版本，旧版本仍可回滚。</div>
          <Button size="sm" className="shrink-0" onClick={() => onNewRelease(release)}>
            <Plus aria-hidden />
            发布新版本
          </Button>
        </div>
        <div className="grid gap-2">
          {versions.map(item => (
            <Card key={item.id} className={item.current ? 'border-info/50 bg-info/5' : undefined}>
              <CardPanel className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">v{item.version}</span>
                    {item.current ? <Badge variant="info">当前生效</Badge> : null}
                    <Badge variant={item.status === 'PUBLISHED' ? 'success' : 'secondary'}>{statusLabel(item.status)[0]}</Badge>
                  </div>
                  <div className={`${monoClass} mt-1 truncate text-muted-foreground`}>Commit {item.resolvedCommit ?? '—'} · {item.releaseNotes || '无发布说明'}</div>
                </div>
                {versionAction(item)}
              </CardPanel>
            </Card>
          ))}
        </div>
      </div>
    </ProductDialog>
  );
}

export function SkillManagementPage() {
  const queryClient = useQueryClient();
  const releases = useQuery({ queryKey: ['skills', 'releases'], queryFn: loadReleases, staleTime: 15_000 });
  const credentials = useQuery({ queryKey: ['skills', 'credentials'], queryFn: loadCredentials, staleTime: 15_000 });
  const [importing, setImporting] = useState(false);
  const [credentialManager, setCredentialManager] = useState(false);
  const [versionRelease, setVersionRelease] = useState<SkillRelease>();
  const [prefill, setPrefill] = useState<SkillRelease>();
  const [preview, setPreview] = useState<SkillRelease>();
  const [confirmAction, setConfirmAction] = useState<{ kind: 'publish' | 'revoke'; release: SkillRelease }>();
  const importMutation = useMutation({ mutationFn: async (body: SkillSourceImportRequest) => { const result = await importSkillRelease({ body }); if (result.error || !result.data?.data?.release) throw new Error(errorMessage(result.error, '技能预检失败')); return result.data.data.release; }, onSuccess: release => { setPreview(release); void queryClient.invalidateQueries({ queryKey: ['skills', 'releases'] }); } });
  const publishMutation = useMutation({ mutationFn: async (release: SkillRelease) => { const result = await publishSkillRelease({ path: { releaseId: release.id }, headers: { 'If-Match': release.revision } }); if (result.error) throw new Error(errorMessage(result.error, '技能发布失败')); }, onSuccess: () => setConfirmAction(undefined), onSettled: () => void queryClient.invalidateQueries({ queryKey: ['skills', 'releases'] }) });
  const revokeMutation = useMutation({ mutationFn: async (release: SkillRelease) => { const result = await revokeSkillRelease({ path: { releaseId: release.id }, headers: { 'If-Match': release.revision } }); if (result.error) throw new Error(errorMessage(result.error, '技能撤销失败')); }, onSuccess: () => setConfirmAction(undefined), onSettled: () => void queryClient.invalidateQueries({ queryKey: ['skills', 'releases'] }) });
  const rows = releases.data ?? [];
  const tableRows = Object.values(rows.reduce<Record<string, SkillRelease>>((result, row) => {
    const current = result[row.name];
    if (!current || row.current || (!current.current && row.id > current.id)) result[row.name] = row;
    return result;
  }, {}));
  const pendingDrafts = useMemo(() => {
    const latest = new Map<string, SkillRelease>();
    for (const row of rows) {
      if (row.status !== 'DRAFT') continue;
      const known = latest.get(row.name);
      if (!known || row.id > known.id) latest.set(row.name, row);
    }
    return latest;
  }, [rows]);
  const columns: ReadonlyArray<ProductTableColumn<SkillRelease>> = useMemo(() => [
    {
      accessorKey: 'name',
      header: '技能',
      cell: ({ row }) => (
        <TableStackCell
          primary={row.original.name}
          secondary={row.original.description || '暂无描述'}
          monoSecondary={false}
          primaryBadge={row.original.current ? <span className="size-1.5 shrink-0 rounded-full bg-success" title="当前生效" /> : undefined}
        />
      ),
      meta: { label: '技能', className: 'w-[235px]', cellClassName: 'w-[235px]' }
    },
    { accessorKey: 'version', header: '版本', cell: ({ row }) => <span className="block truncate font-mono text-xs text-muted-foreground tabular-nums">v{row.original.version}</span>, meta: { label: '版本', className: 'w-[95px]', cellClassName: 'w-[95px]' } },
    {
      id: 'status',
      accessorFn: row => row.status,
      header: '状态',
      cell: ({ row }) => {
        const [label] = statusLabel(row.original.status);
        const tone = row.original.current || row.original.status === 'PUBLISHED'
          ? 'success'
          : row.original.status === 'DRAFT'
            ? 'info'
            : 'neutral';
        return <TableStatusBadge tone={tone} label={row.original.current ? '当前生效' : label} />;
      },
      filterFn: 'equalsString',
      meta: { label: '状态', className: 'w-[105px]', cellClassName: 'w-[105px]' }
    },
    {
      id: 'source',
      accessorFn: row => row.repositoryUrl ?? '',
      header: '源码仓库',
      cell: ({ row }) => (
        <div className="min-w-0 space-y-0.5">
          {row.original.repositoryUrl ? (
            <a className="inline-flex max-w-full items-center gap-1 text-info-foreground hover:underline" href={row.original.repositoryUrl} target="_blank" rel="noreferrer" title={row.original.repositoryUrl}>
              {row.original.credentialId ? <LockKeyhole className="size-3 shrink-0 text-warning" /> : <Globe2 className="size-3 shrink-0 text-success" />}
              <span className="truncate font-mono text-xs">{row.original.repositoryUrl}</span>
              <ExternalLink className="size-3 shrink-0" />
            </a>
          ) : null}
          <div className="truncate text-xs text-muted-foreground">{row.original.credentialId ? '已绑定凭据' : '公开访问'}</div>
        </div>
      ),
      meta: { label: '源码仓库', className: 'w-[270px]', cellClassName: 'w-[270px]' }
    },
    {
      id: 'digest',
      accessorKey: 'artifactSha256',
      header: '摘要',
      cell: ({ row }) => (
        <TableStackCell
          primary={row.original.resolvedCommit?.slice(0, 10) ?? '—'}
          secondary={`${row.original.artifactSha256.slice(0, 10)}…`}
        />
      ),
      meta: { label: '摘要', className: 'w-[140px]', cellClassName: 'w-[140px]' }
    },
    {
      id: 'actions',
      header: '操作',
      enableGlobalFilter: false,
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => {
        const pending = row.original.status === 'DRAFT' ? undefined : pendingDrafts.get(row.original.name);
        return (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" className="relative" aria-label="查看版本历史" title={pending ? `版本历史 · 有待发布的 v${pending.version}` : '版本历史'} onClick={() => setVersionRelease(row.original)}>
              <History aria-hidden />
              {pending ? <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-destructive" aria-hidden /> : null}
            </Button>
            {row.original.status === 'DRAFT' || row.original.status === 'REVOKED' ? (
              <Button variant="ghost" size="icon-xs" disabled={publishMutation.isPending} aria-label="发布技能" title={row.original.status === 'REVOKED' ? '恢复发布' : '发布'} onClick={() => setConfirmAction({ kind: 'publish', release: row.original })}>
                {row.original.status === 'REVOKED' ? <Undo2 aria-hidden /> : <Send aria-hidden />}
              </Button>
            ) : null}
            {pending ? (
              <Button variant="ghost" size="icon-xs" disabled={publishMutation.isPending} aria-label={`发布待发布版本 v${pending.version}`} title={`发布待发布版本 v${pending.version}`} onClick={() => setConfirmAction({ kind: 'publish', release: pending })}>
                <Send aria-hidden />
              </Button>
            ) : null}
            {row.original.status === 'PUBLISHED' && row.original.current ? (
              <Button variant="ghost" size="icon-xs" className="text-destructive-foreground" disabled={revokeMutation.isPending} aria-label="撤销技能" title="撤销" onClick={() => setConfirmAction({ kind: 'revoke', release: row.original })}>
                <ShieldOff aria-hidden />
              </Button>
            ) : null}
          </div>
        );
      },
      meta: { label: '操作', className: 'w-[105px]', cellClassName: 'w-[105px]' }
    }
  ], [pendingDrafts, publishMutation.isPending, revokeMutation.isPending]);
  const currentError = importMutation.error?.message ?? publishMutation.error?.message ?? revokeMutation.error?.message;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-stable">
      <div className="mx-auto flex h-full min-h-[540px] w-full max-w-[1440px] flex-col gap-5 px-5 py-6 sm:px-8 sm:py-7">
        <header className="flex shrink-0 items-start justify-between border-b pb-5">
          <div>
            <h1 className="m-0 font-heading text-xl font-semibold tracking-tight leading-tight text-foreground">技能</h1>
            <p className="mt-1.5 text-xs text-muted-foreground">管理企业内部与外部开源 Agent Skills，支持公有/私有 Git 仓库锚定与版本回滚。</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCredentialManager(true)}>
            <KeyRound aria-hidden />
            凭据管理
            <Badge variant="secondary" size="sm" className="rounded-full tabular-nums">{credentials.data?.length ?? 0}</Badge>
          </Button>
        </header>
        <ProductDataTable
          ariaLabel="技能版本"
          columns={columns}
          data={tableRows}
          emptyText="暂无技能版本"
          error={releases.error}
          filter={{ columnId: 'status', label: '全部状态', options: [{ label: '待发布', value: 'DRAFT' }, { label: '已发布', value: 'PUBLISHED' }, { label: '已撤销', value: 'REVOKED' }] }}
          getRowId={row => row.id}
          isLoading={releases.isLoading}
          onRetry={() => void releases.refetch()}
          searchPlaceholder="搜索技能名称或描述"
          toolbarAction={(
            <Button size="sm" onClick={() => { importMutation.reset(); setPreview(undefined); setPrefill(undefined); setImporting(true); }}>
              <PackageOpen aria-hidden />
              导入技能
            </Button>
          )}
        />
        {currentError ? (
          <Alert variant="error">
            <AlertDescription>{currentError}</AlertDescription>
          </Alert>
        ) : null}
      </div>
      {importing ? (
        <ImportDialog
          credentials={credentials.data ?? []}
          error={importMutation.error?.message}
          saving={importMutation.isPending}
          preview={preview}
          prefill={prefill}
          onClose={() => { setImporting(false); setPreview(undefined); }}
          onSave={value => importMutation.mutate(value)}
          onPublish={release => { setImporting(false); setPreview(undefined); setConfirmAction({ kind: 'publish', release }); }}
          onCredentialsChanged={() => void credentials.refetch()}
        />
      ) : null}
      {credentialManager ? (
        <CredentialManager
          credentials={credentials.data ?? []}
          onClose={() => setCredentialManager(false)}
          onChanged={() => { void credentials.refetch(); }}
        />
      ) : null}
      {versionRelease ? (
        <VersionDialog
          release={versionRelease}
          releases={rows}
          onClose={() => setVersionRelease(undefined)}
          onNewRelease={release => { setVersionRelease(undefined); setPrefill(release); setPreview(undefined); setImporting(true); }}
          onPublish={release => { setConfirmAction({ kind: 'publish', release }); setVersionRelease(undefined); }}
          onRollback={release => { setConfirmAction({ kind: 'publish', release }); setVersionRelease(undefined); }}
        />
      ) : null}
      {confirmAction ? (
        <ConfirmDialog
          title={confirmAction.kind === 'publish' ? '发布技能' : '撤销技能'}
          description={`${confirmAction.kind === 'publish' ? '确认发布' : '确认撤销'}技能“${confirmAction.release.name}” v${confirmAction.release.version}？`}
          confirmLabel={confirmAction.kind === 'publish' ? '发布' : '撤销'}
          saving={publishMutation.isPending || revokeMutation.isPending}
          error={(publishMutation.error ?? revokeMutation.error) ? errorMessage(publishMutation.error ?? revokeMutation.error, '技能操作失败') : undefined}
          onClose={() => { if (!publishMutation.isPending && !revokeMutation.isPending) setConfirmAction(undefined); }}
          onConfirm={() => (confirmAction.kind === 'publish' ? publishMutation : revokeMutation).mutate(confirmAction.release)}
        />
      ) : null}
    </div>
  );
}
