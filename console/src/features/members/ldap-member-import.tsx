/**
 * [INPUT]: 依赖 LDAP 身份源/用户搜索/单人导入 operation、TanStack Query 与产品对话框。
 * [OUTPUT]: 提供选择启用 LDAP 来源、按关键字有界搜索并导入一个可信 DN 的 LdapMemberImportDialog。
 * [POS]: features/members 的按需目录入口；不缓存目录、不提交浏览器中的 subject/姓名/邮箱作为建号事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { Search, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { importLdapUser, listIdentitySources, searchLdapUsers } from '@/api/generated/sdk.gen';
import type {
  EnterpriseErrorResponse,
  IdentitySource,
  IdentitySourcePageData,
  LdapDirectoryUser,
  LdapDirectoryUserSearch,
  LdapMemberImport
} from '@/api/generated/types.gen';
import { Button } from '@/components/atoms/Button';
import { ProductDialog } from '@/components/product/Dialog';

const inputClass = 'h-9 min-w-0 rounded-lg border border-line bg-canvas px-3 text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint disabled:opacity-60';

function message(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'error' in error) {
    const payload = (error as EnterpriseErrorResponse).error;
    if (payload?.message) return payload.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function unwrap<T>(result: { data?: { data: T }; error?: EnterpriseErrorResponse }, fallback: string) {
  if (result.error !== undefined || result.data === undefined) throw new Error(message(result.error, fallback));
  return result.data.data;
}

async function loadLdapSources(): Promise<IdentitySource[]> {
  const page = unwrap<IdentitySourcePageData>(
    await listIdentitySources({ query: { limit: 200 } }),
    'LDAP 身份源读取失败'
  );
  return page.items.filter((source) => source.type === 'LDAP' && source.status === 'ACTIVE');
}

export function LdapMemberImportDialog({
  onClose,
  onImported
}: {
  onClose: () => void;
  onImported: (result: LdapMemberImport) => void;
}) {
  const sources = useQuery({ queryKey: ['identity-sources', 'ldap-import'], queryFn: loadLdapSources });
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [query, setQuery] = useState('');
  const sourceId = selectedSourceId || sources.data?.[0]?.id || '';
  const search = useMutation({
    mutationFn: async () => unwrap<LdapDirectoryUserSearch>(await searchLdapUsers({
      path: { sourceId }, query: { query: query.trim(), limit: 50 }
    }), 'LDAP 用户搜索失败')
  });
  const imported = useMutation({
    mutationFn: async (user: LdapDirectoryUser) => unwrap<LdapMemberImport>(await importLdapUser({
      body: { dn: user.dn },
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      path: { sourceId }
    }), 'LDAP 成员导入失败'),
    onSuccess: onImported
  });
  const error = sources.error ?? search.error ?? imported.error;

  return (
    <ProductDialog className="max-w-[720px]" title="从 LDAP 导入成员" onClose={onClose}>
      <div className="grid gap-4 p-5">
        <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)_auto]">
          <select aria-label="LDAP 身份源" className={inputClass} value={sourceId} disabled={sources.isLoading || imported.isPending} onChange={(event) => { setSelectedSourceId(event.target.value); search.reset(); }}>
            {sources.isLoading ? <option>正在加载...</option> : null}
            {sources.data?.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
          </select>
          <input aria-label="LDAP 用户关键字" className={inputClass} maxLength={128} placeholder="账号、姓名或邮箱" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Button type="button" size="sm" disabled={sourceId === '' || query.trim() === '' || search.isPending || imported.isPending} onClick={() => search.mutate()}>
            <Search aria-hidden className="size-3.5" />{search.isPending ? '搜索中' : '搜索'}
          </Button>
        </div>
        {sources.data?.length === 0 ? <p className="m-0 text-[12.5px] text-ink-3">没有启用的 LDAP 身份源</p> : null}
        {search.data?.items.length === 0 ? <p className="m-0 text-[12.5px] text-ink-3">未找到匹配用户</p> : null}
        {search.data?.items.length ? (
          <ul className="m-0 max-h-[420px] list-none divide-y divide-line overflow-y-auto border-y border-line p-0">
            {search.data.items.map((user) => (
              <li key={user.dn} className="flex min-w-0 items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink">{user.displayName} <span className="font-normal text-ink-3">({user.username})</span></div>
                  <div className="truncate text-[11.5px] text-ink-3" title={user.email ?? user.dn}>{user.email ?? user.dn}</div>
                </div>
                <Button type="button" size="xs" disabled={imported.isPending} onClick={() => imported.mutate(user)}>
                  <UserPlus aria-hidden className="size-3.5" />导入
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <p role="alert" className="m-0 text-[12.5px] text-red">{message(error, 'LDAP 操作失败')}</p> : null}
      </div>
      <footer className="flex justify-end border-t border-line px-5 py-4"><Button type="button" size="sm" onClick={onClose}>关闭</Button></footer>
    </ProductDialog>
  );
}
