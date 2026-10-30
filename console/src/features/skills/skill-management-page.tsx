/**
 * [INPUT]: 依赖 skill admin OpenAPI、ProductDataTable、ProductDialog 和 Beautiful UI tokens。
 * [OUTPUT]: 提供公开/私有 Skill 导入、真实预检草稿、凭据管理、发布/撤销、版本历史和回滚工作台。
 * [POS]: features/skills 的管理端纵向页面；员工端只消费已发布当前版本。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock3, ExternalLink, Globe2, History, KeyRound, LockKeyhole, PackageOpen, Plus, RotateCcw, Send, ShieldCheck, ShieldOff, Undo2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { createSkillSourceCredential, importSkillRelease, listSkillReleases, listSkillSourceCredentials, publishSkillRelease, revokeSkillRelease, revokeSkillSourceCredential, rotateSkillSourceCredential } from '@/api/generated/sdk.gen';
import type { EnterpriseErrorResponse, SkillRelease, SkillSourceCredential, SkillSourceCredentialWriteRequestWritable, SkillSourceImportRequest } from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { StatusPill } from '@/components/atoms/StatusPill';
import { ProductDataTable, type ProductTableColumn } from '@/components/product/DataTable';
import { ProductDialog } from '@/components/product/Dialog';
import { DialogFooter } from '@/components/product/DialogFooter';

const inputClass = 'h-9 w-full rounded-lg border border-line bg-canvas px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-tint disabled:cursor-not-allowed disabled:opacity-55';
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
  return status === 'PUBLISHED' ? ['已发布', 'green'] as const : status === 'REVOKED' ? ['已撤销', 'neutral'] as const : ['待发布', 'accent'] as const;
}

function credentialLabel(value: SkillSourceCredential) {
  return `${value.name} · ${value.host} · ${value.tokenHint}`;
}

function repositoryInfo(value: string) {
  try {
    const url = new URL(value);
    return { host: url.host, projectPath: url.pathname.replace(/^\//, '').replace(/\.git$/, '') };
  } catch {
    return { host: '', projectPath: '' };
  }
}

function ImportDialog({ credentials, error, saving, preview, prefill, onClose, onSave, onCredentialsChanged }: {
  credentials: SkillSourceCredential[]; error?: string; saving: boolean; preview?: SkillRelease; prefill?: SkillRelease;
  onClose: () => void; onSave: (value: SkillSourceImportRequest) => void; onCredentialsChanged: () => void;
}) {
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>(prefill?.credentialId ? 'PRIVATE' : 'PUBLIC');
  const [value, setValue] = useState({ repositoryUrl: prefill?.repositoryUrl ?? '', revision: '', subpath: prefill?.repositoryPath ?? '', credentialId: prefill?.credentialId ?? '', releaseNotes: '' });
  const [addingCredential, setAddingCredential] = useState(false);
  const [newCredential, setNewCredential] = useState({ name: '', token: '', expiresAt: '' });
  const queryClient = useQueryClient();
  const addCredential = useMutation({ mutationFn: async (body: SkillSourceCredentialWriteRequestWritable) => { const result = await createSkillSourceCredential({ body }); if (result.error || !result.data?.data) throw new Error(errorMessage(result.error, '凭据保存失败')); return result.data.data; }, onSuccess: created => { setValue(current => ({ ...current, credentialId: created.id })); setAddingCredential(false); setNewCredential({ name: '', token: '', expiresAt: '' }); void queryClient.invalidateQueries({ queryKey: ['skills', 'credentials'] }); onCredentialsChanged(); } });
  const set = (key: keyof typeof value, next: string) => setValue(current => ({ ...current, [key]: next }));
  const repo = repositoryInfo(value.repositoryUrl);

  if (preview) return <ProductDialog title="导入完成 · 草稿已创建" onClose={onClose}><div className="grid gap-4 p-5"><div className="rounded-xl border border-green/20 bg-green-tint p-4 text-[12px] text-green"><div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4" />已真实拉取并校验 SKILL.md</div><div className="mt-3 grid gap-1.5 text-ink-2"><div>技能：<b>{preview.name}</b> · v{preview.version}</div><div>Commit：<span className={monoClass}>{preview.resolvedCommit}</span></div><div>SHA-256：<span className={monoClass}>{preview.artifactSha256}</span></div><div>大小：{Math.round(preview.artifactSizeBytes / 1024)} KB · 状态：待发布</div></div></div><p className="m-0 text-[12px] text-ink-3">草稿已进入目录。发布后才会对员工端可见。</p><DialogFooter><Button type="button" variant="primary" size="sm" onClick={onClose}>完成</Button></DialogFooter></div></ProductDialog>;

  function submit(event: FormEvent) { event.preventDefault(); onSave({ repositoryUrl: value.repositoryUrl.trim(), revision: value.revision.trim(), subpath: value.subpath.trim(), visibility, credentialId: visibility === 'PRIVATE' ? value.credentialId || null : null, releaseNotes: value.releaseNotes.trim() }); }
  function saveCredential() { const detected = repositoryInfo(value.repositoryUrl); if (!newCredential.name.trim() || !newCredential.token.trim() || !detected.host) return; addCredential.mutate({ name: newCredential.name.trim(), host: detected.host, projectPath: detected.projectPath || null, token: newCredential.token, expiresAt: newCredential.expiresAt ? new Date(newCredential.expiresAt).toISOString() : null }); }

  return <ProductDialog title={prefill ? '发布新版本' : '导入技能'} className="max-w-[560px]" onClose={onClose}><form className="grid gap-4 p-5" onSubmit={submit}><p className="m-0 text-[12px] leading-relaxed text-ink-3">服务端会按指定 ref 固定 commit，读取并校验 <code className="rounded bg-inset px-1 py-0.5 font-mono text-ink-2">SKILL.md</code>，解析出的元数据和摘要会在导入后展示。</p><div className="grid gap-1.5"><span className="text-[12.5px] font-medium text-ink-2">仓库访问类型</span><div className="grid grid-cols-2 gap-2 rounded-xl bg-inset p-1"><button type="button" className={`flex items-center justify-center gap-2 rounded-lg py-2 text-[12px] font-medium ${visibility === 'PUBLIC' ? 'bg-surface text-ink shadow-sm' : 'text-ink-3'}`} onClick={() => setVisibility('PUBLIC')}><Globe2 className="size-3.5 text-green" />公开仓库</button><button type="button" className={`flex items-center justify-center gap-2 rounded-lg py-2 text-[12px] font-medium ${visibility === 'PRIVATE' ? 'bg-surface text-ink shadow-sm' : 'text-ink-3'}`} onClick={() => setVisibility('PRIVATE')}><LockKeyhole className="size-3.5 text-orange" />私有仓库</button></div></div><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">仓库地址<input required type="url" className={inputClass} placeholder="https://gitlab.corp.com/ai-team/enterprise-skills" value={value.repositoryUrl} onChange={event => set('repositoryUrl', event.target.value)} /></label><div className="grid grid-cols-[130px_1fr] gap-2"><select aria-label="ref 类型" className={`${inputClass} px-2`} value="tag" onChange={() => undefined}><option value="tag">Git Tag / Ref</option></select><input required className={`${inputClass} ${monoClass}`} placeholder="v1.2.0 或 commit SHA" value={value.revision} onChange={event => set('revision', event.target.value)} /></div><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">技能子目录 <span className="font-normal text-ink-3">（Monorepo 可选）</span><input className={`${inputClass} ${monoClass}`} placeholder="skills/code-review" value={value.subpath} onChange={event => set('subpath', event.target.value)} /></label>{visibility === 'PRIVATE' ? <div className="grid gap-3 rounded-xl border border-orange/25 bg-orange-tint/40 p-4"><div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink"><KeyRound className="size-3.5 text-orange" />仓库访问凭据</span><button type="button" className="inline-flex items-center gap-1 text-[11px] font-medium text-accent" onClick={() => setAddingCredential(current => !current)}><Plus className="size-3" />{addingCredential ? '收起' : '新增凭据'}</button></div>{addingCredential ? <div className="grid gap-2 border-t border-orange/20 pt-3"><input className={inputClass} placeholder="凭据备注名称" value={newCredential.name} onChange={event => setNewCredential(current => ({ ...current, name: event.target.value }))} /><input className={`${inputClass} ${monoClass}`} type="password" placeholder="Access Token" value={newCredential.token} onChange={event => setNewCredential(current => ({ ...current, token: event.target.value }))} /><input className={inputClass} type="date" value={newCredential.expiresAt} onChange={event => setNewCredential(current => ({ ...current, expiresAt: event.target.value }))} /><Button type="button" size="sm" variant="primary" disabled={addCredential.isPending || !repo.host} onClick={saveCredential}>{addCredential.isPending ? '保存中' : `保存并选用${repo.host ? ` · ${repo.host}` : ''}`}</Button>{addCredential.error ? <p className="m-0 text-[11px] text-red">{addCredential.error.message}</p> : null}</div> : <><select required className={inputClass} value={value.credentialId} onChange={event => set('credentialId', event.target.value)}><option value="">选择访问凭据</option>{credentials.filter(item => item.status === 'ACTIVE' && (!item.host || item.host === repo.host)).map(item => <option key={item.id} value={item.id}>{credentialLabel(item)}</option>)}</select><p className="m-0 text-[11px] text-ink-3">凭据只在服务端加密保存，预检会验证它能否读取当前仓库。</p></>}</div> : null}<label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">发布说明 <span className="font-normal text-ink-3">（可选）</span><textarea className={`${inputClass} h-16 resize-y py-2`} placeholder="记录这次版本变更" value={value.releaseNotes} onChange={event => set('releaseNotes', event.target.value)} /></label>{error ? <p role="alert" className="m-0 text-[12.5px] text-red">{error}</p> : null}<div className="flex items-center justify-between border-t border-line pt-4"><span className="flex items-center gap-1.5 text-[11px] text-ink-3"><ShieldCheck className="size-3.5 text-green" />会校验真实 Commit、SKILL.md 和 SHA-256</span><DialogFooter><Button type="button" size="sm" onClick={onClose}>取消</Button><Button type="submit" variant="primary" size="sm" disabled={saving || (visibility === 'PRIVATE' && !value.credentialId)}>{saving ? '校验并导入中' : '预检并创建草稿'}</Button></DialogFooter></div></form></ProductDialog>;
}

function CredentialDialog({ credential, onClose, onSaved }: { credential?: SkillSourceCredential; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState({ name: credential?.name ?? '', host: credential?.host ?? '', projectPath: credential?.projectPath ?? '', token: '', expiresAt: credential?.expiresAt?.slice(0, 10) ?? '' });
  const mutation = useMutation({
    mutationFn: async (body: SkillSourceCredentialWriteRequestWritable) => {
      const result = credential
        ? await rotateSkillSourceCredential({ path: { credentialId: credential.id }, headers: { 'If-Match': credential.revision }, body })
        : await createSkillSourceCredential({ body });
      if (result.error) throw new Error(errorMessage(result.error, credential ? '凭据轮换失败' : '凭据保存失败'));
    },
    onSuccess: () => { onSaved(); onClose(); }
  });
  return <ProductDialog title={credential ? '轮换仓库访问凭据' : '新增仓库访问凭据'} onClose={onClose}><form className="grid gap-4 p-5" onSubmit={event => { event.preventDefault(); mutation.mutate({ name: value.name.trim(), host: value.host.trim(), projectPath: value.projectPath.trim() || null, token: value.token, expiresAt: value.expiresAt ? new Date(value.expiresAt).toISOString() : null }); }}><p className="m-0 text-[12px] text-ink-3">只需要能读取仓库的凭据。Project Token、Personal Token 等类型由 GitLab 自己决定，系统只验证实际读取能力。</p><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">备注名称<input required className={inputClass} placeholder="内网 GitLab 只读凭据" value={value.name} onChange={event => setValue(current => ({ ...current, name: event.target.value }))} /></label><div className="grid grid-cols-2 gap-2"><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">GitLab Host<input required className={inputClass} placeholder="gitlab.corp.com" value={value.host} onChange={event => setValue(current => ({ ...current, host: event.target.value }))} /></label><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">项目路径 <span className="font-normal text-ink-3">（可选）</span><input className={inputClass} placeholder="team/skills" value={value.projectPath} onChange={event => setValue(current => ({ ...current, projectPath: event.target.value }))} /></label></div><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">Access Token<input required type="password" className={`${inputClass} ${monoClass}`} value={value.token} onChange={event => setValue(current => ({ ...current, token: event.target.value }))} /></label><label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">过期时间 <span className="font-normal text-ink-3">（可选）</span><input type="date" className={inputClass} value={value.expiresAt} onChange={event => setValue(current => ({ ...current, expiresAt: event.target.value }))} /></label>{mutation.error ? <p role="alert" className="m-0 text-[12px] text-red">{mutation.error.message}</p> : null}<DialogFooter><Button type="button" size="sm" onClick={onClose}>取消</Button><Button type="submit" variant="primary" size="sm" disabled={mutation.isPending}>{mutation.isPending ? '保存中' : credential ? '轮换并恢复' : '保存凭据'}</Button></DialogFooter></form></ProductDialog>;
}

function CredentialManager({ credentials, onClose, onChanged }: { credentials: SkillSourceCredential[]; onClose: () => void; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [rotating, setRotating] = useState<SkillSourceCredential>();
  const revoke = useMutation({ mutationFn: async (credential: SkillSourceCredential) => { const result = await revokeSkillSourceCredential({ path: { credentialId: credential.id }, headers: { 'If-Match': credential.revision } }); if (result.error) throw new Error(errorMessage(result.error, '凭据撤销失败')); }, onSuccess: onChanged });
  if (adding || rotating) return <CredentialDialog credential={rotating} onClose={() => { setAdding(false); setRotating(undefined); }} onSaved={onChanged} />;
  return <ProductDialog title={`仓库访问凭据（${credentials.length}）`} onClose={onClose}><div className="grid gap-3 p-5"><div className="flex items-center justify-between"><p className="m-0 text-[12px] text-ink-3">凭据只用于服务端回源，列表只显示脱敏信息。</p><Button size="sm" variant="primary" onClick={() => setAdding(true)}><Plus className="size-3.5" />新增凭据</Button></div>{credentials.map(item => <div key={item.id} className="flex items-center justify-between rounded-xl border border-line p-3"><div className="min-w-0"><div className="truncate text-[12.5px] font-semibold text-ink">{item.name}</div><div className={`${monoClass} mt-1 truncate text-ink-3`}>{item.tokenHint} · {item.host}{item.projectPath ? `/${item.projectPath}` : ''}</div>{item.expiresAt ? <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-3"><Clock3 className="size-3" />到期 {new Date(item.expiresAt).toLocaleDateString('zh-CN')}</div> : null}</div><div className="flex items-center gap-2"><StatusPill tone={item.status === 'ACTIVE' ? 'green' : item.status === 'EXPIRED' ? 'orange' : 'neutral'}>{item.status === 'ACTIVE' ? '正常' : item.status === 'EXPIRED' ? '已过期' : '已撤销'}</StatusPill><Button variant="quiet" size="xs" onClick={() => setRotating(item)}><RotateCcw className="size-3.5" />轮换</Button>{item.status !== 'REVOKED' ? <Button variant="quiet" size="xs" className="text-red" disabled={revoke.isPending} onClick={() => revoke.mutate(item)}><ShieldOff className="size-3.5" />撤销</Button> : null}</div></div>)}{credentials.length === 0 ? <div className="rounded-xl border border-dashed border-line p-8 text-center text-[12px] text-ink-3">还没有仓库访问凭据</div> : null}{revoke.error ? <p role="alert" className="m-0 text-[12px] text-red">{revoke.error.message}</p> : null}</div></ProductDialog>;
}

function VersionDialog({ release, releases, onClose, onNewRelease, onRollback }: { release: SkillRelease; releases: SkillRelease[]; onClose: () => void; onNewRelease: (release: SkillRelease) => void; onRollback: (release: SkillRelease) => void }) {
  const versions = releases.filter(item => item.name === release.name).sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  return <ProductDialog title={`${release.name} · 版本历史`} onClose={onClose}><div className="grid gap-4 p-5"><div className="flex items-center justify-between rounded-xl border border-line bg-inset p-3"><div className="text-[11px] leading-relaxed text-ink-3">每个版本固定到真实 Commit。发布新版本会切换当前生效版本，旧版本仍可回滚。</div><Button size="sm" variant="primary" onClick={() => onNewRelease(release)}><Plus className="size-3.5" />发布新版本</Button></div><div className="grid gap-2">{versions.map(item => <div key={item.id} className={`flex items-center justify-between rounded-xl border p-3 ${item.current ? 'border-accent bg-accent-tint/30' : 'border-line'}`}><div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-[13px] font-semibold text-ink">v{item.version}</span>{item.current ? <StatusPill tone="accent">当前生效</StatusPill> : null}<StatusPill tone={item.status === 'PUBLISHED' ? 'green' : 'neutral'}>{statusLabel(item.status)[0]}</StatusPill></div><div className={`${monoClass} mt-1 truncate text-ink-3`}>Commit {item.resolvedCommit ?? '—'} · {item.releaseNotes || '无发布说明'}</div></div>{!item.current && item.status === 'PUBLISHED' ? <Button variant="quiet" size="xs" onClick={() => onRollback(item)}><RotateCcw className="size-3.5" />回滚</Button> : null}</div>)}</div></div></ProductDialog>;
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
  const importMutation = useMutation({ mutationFn: async (body: SkillSourceImportRequest) => { const result = await importSkillRelease({ body }); if (result.error || !result.data?.data?.release) throw new Error(errorMessage(result.error, '技能预检失败')); return result.data.data.release; }, onSuccess: release => { setPreview(release); void queryClient.invalidateQueries({ queryKey: ['skills', 'releases'] }); } });
  const publishMutation = useMutation({ mutationFn: async (release: SkillRelease) => { const result = await publishSkillRelease({ path: { releaseId: release.id }, headers: { 'If-Match': release.revision } }); if (result.error) throw new Error(errorMessage(result.error, '技能发布失败')); }, onSettled: () => void queryClient.invalidateQueries({ queryKey: ['skills', 'releases'] }) });
  const revokeMutation = useMutation({ mutationFn: async (release: SkillRelease) => { const result = await revokeSkillRelease({ path: { releaseId: release.id }, headers: { 'If-Match': release.revision } }); if (result.error) throw new Error(errorMessage(result.error, '技能撤销失败')); }, onSettled: () => void queryClient.invalidateQueries({ queryKey: ['skills', 'releases'] }) });
  const rows = releases.data ?? [];
  const tableRows = Object.values(rows.reduce<Record<string, SkillRelease>>((result, row) => {
    const current = result[row.name];
    if (!current || row.current || (!current.current && row.id > current.id)) result[row.name] = row;
    return result;
  }, {}));
  const columns: ReadonlyArray<ProductTableColumn<SkillRelease>> = useMemo(() => [
    { accessorKey: 'name', header: '技能', cell: ({ row }) => <div className="min-w-0"><div className="flex items-center gap-2 truncate font-medium text-ink">{row.original.name}{row.original.current ? <span className="size-1.5 rounded-full bg-green" title="当前生效" /> : null}</div><div className="truncate text-[11px] text-ink-3">{row.original.description || '暂无描述'}</div></div>, meta: { label: '技能', className: 'w-[235px]', cellClassName: 'w-[235px]' } },
    { accessorKey: 'version', header: '版本', cell: ({ row }) => <span className={monoClass}>v{row.original.version}</span>, meta: { label: '版本', className: 'w-[95px]', cellClassName: 'w-[95px]' } },
    { id: 'status', accessorFn: row => row.status, header: '状态', cell: ({ row }) => { const [label, tone] = statusLabel(row.original.status); return <StatusPill tone={tone}>{row.original.current ? '当前生效' : label}</StatusPill>; }, filterFn: 'equalsString', meta: { label: '状态', className: 'w-[105px]', cellClassName: 'w-[105px]' } },
    { id: 'source', accessorFn: row => row.repositoryUrl ?? '', header: '源码仓库 & 凭据', cell: ({ row }) => <div className="min-w-0">{row.original.repositoryUrl ? <a className="inline-flex max-w-full items-center gap-1 truncate text-accent hover:underline" href={row.original.repositoryUrl} target="_blank" rel="noreferrer">{row.original.credentialId ? <LockKeyhole className="size-3 shrink-0 text-orange" /> : <Globe2 className="size-3 shrink-0 text-green" />}<span className="truncate">{row.original.repositoryUrl}</span><ExternalLink className="size-3 shrink-0" /></a> : null}<div className="truncate text-[11px] text-ink-3">{row.original.repositoryPath || '/'}{row.original.credentialId ? ' · 已绑定凭据' : ' · 公开访问'}</div></div>, meta: { label: '源码仓库 & 凭据', className: 'w-[270px]', cellClassName: 'w-[270px]' } },
    { id: 'digest', accessorKey: 'artifactSha256', header: 'Commit / SHA-256', cell: ({ row }) => <div className={monoClass}><div>{row.original.resolvedCommit?.slice(0, 10) ?? '—'}</div><div className="text-ink-3">{row.original.artifactSha256.slice(0, 10)}…</div></div>, meta: { label: 'Commit / SHA-256', className: 'w-[145px]', cellClassName: 'w-[145px]' } },
    { id: 'actions', header: '操作', enableGlobalFilter: false, enableHiding: false, enableSorting: false, cell: ({ row }) => <div className="flex items-center gap-1"><Button variant="quiet" size="xs" className="size-7 rounded-md p-0" aria-label="查看版本历史" title="版本历史" onClick={() => setVersionRelease(row.original)}><History className="size-3.5" /></Button>{row.original.status === 'DRAFT' || row.original.status === 'REVOKED' ? <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={publishMutation.isPending} aria-label="发布技能" title={row.original.status === 'REVOKED' ? '恢复发布' : '发布'} onClick={() => publishMutation.mutate(row.original)}>{row.original.status === 'REVOKED' ? <Undo2 className="size-3.5" /> : <Send className="size-3.5" />}</Button> : row.original.status === 'PUBLISHED' && row.original.current ? <Button variant="quiet" size="xs" className="size-7 rounded-md p-0 text-red" disabled={revokeMutation.isPending} aria-label="撤销技能" title="撤销" onClick={() => revokeMutation.mutate(row.original)}><ShieldOff className="size-3.5" /></Button> : null}</div>, meta: { label: '操作', className: 'w-[105px]', cellClassName: 'w-[105px]' } }
  ], [publishMutation.isPending, revokeMutation.isPending]);
  const currentError = importMutation.error?.message ?? publishMutation.error?.message ?? revokeMutation.error?.message;
  return <div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto flex min-h-full w-full max-w-[1440px] flex-col gap-5 px-5 py-7 sm:px-8 sm:py-9"><header className="flex items-start justify-between border-b border-line pb-5"><div><h1 className="m-0 text-[22px] font-semibold leading-tight text-ink">技能</h1><p className="mt-1.5 text-[12px] text-ink-3">管理企业内部与外部开源 Agent Skills，支持公有/私有 Git 仓库锚定与版本回滚。</p></div><Button size="sm" onClick={() => setCredentialManager(true)}><KeyRound className="size-3.5" />凭据管理 <span className="rounded-full bg-inset px-1.5 py-0.5 text-[10px]">{credentials.data?.length ?? 0}</span></Button></header><ProductDataTable ariaLabel="技能版本" columns={columns} data={tableRows} emptyText="暂无技能版本" error={releases.error} filter={{ columnId: 'status', defaultFilterValue: 'PUBLISHED', label: '全部状态', options: [{ label: '待发布', value: 'DRAFT' }, { label: '已发布', value: 'PUBLISHED' }, { label: '已撤销', value: 'REVOKED' }] }} getRowId={row => row.id} isLoading={releases.isLoading} onRetry={() => void releases.refetch()} searchPlaceholder="搜索技能名称或描述" toolbarAction={<Button variant="primary" size="xs" onClick={() => { importMutation.reset(); setPreview(undefined); setPrefill(undefined); setImporting(true); }}><PackageOpen className="size-3.5" />导入技能</Button>} />{currentError ? <p role="alert" className="m-0 text-[12.5px] text-red">{currentError}</p> : null}</div>{importing ? <ImportDialog credentials={credentials.data ?? []} error={importMutation.error?.message} saving={importMutation.isPending} preview={preview} prefill={prefill} onClose={() => { setImporting(false); setPreview(undefined); }} onSave={value => importMutation.mutate(value)} onCredentialsChanged={() => void credentials.refetch()} /> : null}{credentialManager ? <CredentialManager credentials={credentials.data ?? []} onClose={() => setCredentialManager(false)} onChanged={() => { void credentials.refetch(); }} /> : null}{versionRelease ? <VersionDialog release={versionRelease} releases={rows} onClose={() => setVersionRelease(undefined)} onNewRelease={release => { setVersionRelease(undefined); setPrefill(release); setPreview(undefined); setImporting(true); }} onRollback={release => { publishMutation.mutate(release); setVersionRelease(undefined); }} /> : null}</div>;
}
