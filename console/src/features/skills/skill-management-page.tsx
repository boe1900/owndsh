/**
 * [INPUT]: 依赖 skill admin OpenAPI、ProductDataTable 和 ProductDialog。
 * [OUTPUT]: 提供公开仓库导入、skill release 发布/撤销目录工作台；不提供用户、设备或租户分配。
 * [POS]: features/skills 的管理端纵向页面；员工端在本机按需安装已发布版本。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageOpen, Send, ShieldOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { importSkillRelease, listSkillReleases, publishSkillRelease, revokeSkillRelease } from '@/api/generated/sdk.gen';
import type { EnterpriseErrorResponse, SkillRelease, SkillSourceImportRequest } from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { StatusPill } from '@/components/atoms/StatusPill';
import { ProductDataTable, type ProductTableColumn } from '@/components/product/DataTable';
import { ProductDialog } from '@/components/product/Dialog';
import { DialogFooter } from '@/components/product/DialogFooter';

const inputClass = 'h-9 w-full rounded-lg border border-line bg-canvas px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent-tint disabled:cursor-not-allowed disabled:opacity-55';

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'error' in error) {
    const payload = (error as EnterpriseErrorResponse).error;
    if (payload?.message) return payload.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

async function loadReleases(cursor?: string): Promise<SkillRelease[]> {
  const result = await listSkillReleases({ query: { limit: 200, ...(cursor ? { cursor } : {}) } });
  const page = result.data?.data;
  if (result.error !== undefined || !page || !Array.isArray(page.items) || !page.page) throw new Error(errorMessage(result.error, '技能目录加载失败'));
  const items = [...page.items];
  if (page.page.hasMore && page.page.nextCursor) items.push(...await loadReleases(page.page.nextCursor));
  return items;
}

function statusLabel(status: SkillRelease['status']) {
  return status === 'PUBLISHED' ? ['已发布', 'green'] as const : status === 'REVOKED' ? ['已撤销', 'neutral'] as const : ['待发布', 'accent'] as const;
}

function ImportDialog({ error, saving, onClose, onSave }: { error?: string; saving: boolean; onClose: () => void; onSave: (value: SkillSourceImportRequest) => void }) {
  const [value, setValue] = useState<SkillSourceImportRequest>({ repositoryUrl: '', revision: 'main', subpath: '' });
  const set = (key: keyof SkillSourceImportRequest, next: string) => setValue(current => ({ ...current, [key]: next }));
  return <ProductDialog title="导入技能" onClose={onClose}>
    <form className="grid gap-4 p-5" onSubmit={(event: FormEvent) => { event.preventDefault(); onSave({ repositoryUrl: value.repositoryUrl.trim(), revision: value.revision.trim(), subpath: value.subpath.trim() }); }}>
      <p className="m-0 text-[12px] text-ink-3">仅支持公开 HTTPS GitHub/GitLab 仓库；服务端会固定 commit 并校验 SKILL.md。</p>
      <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">仓库地址<input required type="url" className={inputClass} placeholder="https://github.com/org/skills" value={value.repositoryUrl} onChange={event => set('repositoryUrl', event.target.value)} /></label>
      <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">分支、标签或 commit<input required className={inputClass} placeholder="main" value={value.revision} onChange={event => set('revision', event.target.value)} /></label>
      <label className="grid gap-1.5 text-[12.5px] font-medium text-ink-2">技能子目录（可选）<input className={inputClass} placeholder="skills/code-review" value={value.subpath} onChange={event => set('subpath', event.target.value)} /></label>
      {error ? <p role="alert" className="m-0 text-[12.5px] text-red">{error}</p> : null}
      <DialogFooter><Button type="button" size="sm" onClick={onClose}>取消</Button><Button type="submit" variant="primary" size="sm" disabled={saving}>{saving ? '导入中' : '开始导入'}</Button></DialogFooter>
    </form>
  </ProductDialog>;
}

const releaseColumns: ReadonlyArray<ProductTableColumn<SkillRelease>> = [
  { accessorKey: 'name', header: '技能', cell: ({ row }) => <div className="min-w-0"><div className="truncate font-medium text-ink">{row.original.name}</div><div className="truncate text-[11px] text-ink-3">{row.original.description || '暂无描述'}</div></div>, meta: { label: '技能', className: 'w-[250px]', cellClassName: 'w-[250px]' } },
  { accessorKey: 'version', header: '版本', meta: { label: '版本', className: 'w-[110px]', cellClassName: 'w-[110px]' } },
  { id: 'status', accessorFn: row => row.status, header: '状态', cell: ({ row }) => { const [label, tone] = statusLabel(row.original.status); return <StatusPill tone={tone}>{label}</StatusPill>; }, filterFn: 'equalsString', meta: { label: '状态', className: 'w-[100px]', cellClassName: 'w-[100px]' } },
  { id: 'digest', accessorKey: 'artifactSha256', header: '制品摘要', cell: ({ row }) => <span className="font-mono text-[11px] text-ink-3">{row.original.artifactSha256.slice(0, 12)}…</span>, meta: { label: '制品摘要', className: 'w-[150px]', cellClassName: 'w-[150px]' } }
];

export function SkillManagementPage() {
  const queryClient = useQueryClient();
  const releases = useQuery({ queryKey: ['skills', 'releases'], queryFn: () => loadReleases(), staleTime: 15_000 });
  const [importing, setImporting] = useState(false);
  const importMutation = useMutation({ mutationFn: async (body: SkillSourceImportRequest) => { const result = await importSkillRelease({ body }); if (result.error) throw new Error(errorMessage(result.error, '技能导入失败')); }, onSuccess: () => { setImporting(false); void queryClient.invalidateQueries({ queryKey: ['skills', 'releases'] }); } });
  const publishMutation = useMutation({ mutationFn: async (release: SkillRelease) => { const result = await publishSkillRelease({ path: { releaseId: release.id }, headers: { 'If-Match': release.revision } }); if (result.error) throw new Error(errorMessage(result.error, '技能发布失败')); }, onSettled: () => void queryClient.invalidateQueries({ queryKey: ['skills', 'releases'] }) });
  const revokeMutation = useMutation({ mutationFn: async (release: SkillRelease) => { const result = await revokeSkillRelease({ path: { releaseId: release.id }, headers: { 'If-Match': release.revision } }); if (result.error) throw new Error(errorMessage(result.error, '技能撤销失败')); }, onSettled: () => void queryClient.invalidateQueries({ queryKey: ['skills', 'releases'] }) });
  const rows = releases.data ?? [];
  const currentError = importMutation.error?.message ?? publishMutation.error?.message ?? revokeMutation.error?.message;
  const actionColumns: ReadonlyArray<ProductTableColumn<SkillRelease>> = [...releaseColumns, { id: 'actions', header: '操作', enableGlobalFilter: false, enableHiding: false, enableSorting: false, cell: ({ row }) => <div className="flex items-center gap-1">{row.original.status === 'DRAFT' ? <Button variant="quiet" size="xs" className="size-7 rounded-md p-0" disabled={publishMutation.isPending} aria-label="发布技能" title="发布" onClick={() => publishMutation.mutate(row.original)}><Send className="size-3.5" /></Button> : row.original.status === 'PUBLISHED' ? <Button variant="quiet" size="xs" className="size-7 rounded-md p-0 text-red" disabled={revokeMutation.isPending} aria-label="撤销技能" title="撤销" onClick={() => revokeMutation.mutate(row.original)}><ShieldOff className="size-3.5" /></Button> : null}</div>, meta: { label: '操作', className: 'w-[80px]', cellClassName: 'w-[80px]' } }];
  return <div className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto flex min-h-full w-full max-w-[1320px] flex-col gap-5 px-5 py-7 sm:px-8 sm:py-9"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5"><div><h1 className="m-0 text-[22px] font-semibold leading-tight text-ink">技能</h1><p className="m-0 mt-1 text-[12px] text-ink-3">发布公开仓库版本，用户在桌面端按需安装。</p></div><Button variant="primary" size="xs" onClick={() => { importMutation.reset(); setImporting(true); }}><PackageOpen className="size-3.5" />导入技能</Button></header><ProductDataTable ariaLabel="技能版本" columns={actionColumns} data={rows} emptyText="暂无技能版本" error={releases.error} filter={{ columnId: 'status', defaultFilterValue: 'PUBLISHED', label: '全部状态', options: [{ label: '待发布', value: 'DRAFT' }, { label: '已发布', value: 'PUBLISHED' }, { label: '已撤销', value: 'REVOKED' }] }} getRowId={row => row.id} isLoading={releases.isLoading} onRetry={() => void releases.refetch()} searchPlaceholder="搜索技能名称或描述" />{currentError ? <p role="alert" className="m-0 text-[12.5px] text-red">{currentError}</p> : null}</div>{importing ? <ImportDialog error={importMutation.error?.message} saving={importMutation.isPending} onClose={() => setImporting(false)} onSave={value => importMutation.mutate(value)} /> : null}</div>;
}
