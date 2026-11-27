/**
 * [INPUT]: 依赖 LDAP 身份源/用户搜索/单人导入 operation、TanStack Query、产品对话框、lib/crypto 与 coss UI Button/Input/Select/Alert。
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductDialog } from '@/components/product/Dialog';
import { DialogFooter } from '@/components/product/DialogFooter';
import { randomUuid } from '@/lib/crypto';

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
  const sourceItems = sources.isLoading
    ? [{ label: '正在加载...', value: '' }]
    : (sources.data ?? []).map((source) => ({ label: source.name, value: source.id }));
  const search = useMutation({
    mutationFn: async () => unwrap<LdapDirectoryUserSearch>(await searchLdapUsers({
      path: { sourceId }, query: { query: query.trim(), limit: 50 }
    }), 'LDAP 用户搜索失败')
  });
  const imported = useMutation({
    mutationFn: async (user: LdapDirectoryUser) => unwrap<LdapMemberImport>(await importLdapUser({
      body: { dn: user.dn },
      headers: { 'Idempotency-Key': randomUuid() },
      path: { sourceId }
    }), 'LDAP 成员导入失败'),
    onSuccess: onImported
  });
  const error = sources.error ?? search.error ?? imported.error;

  return (
    <ProductDialog className="max-w-[720px]" title="从 LDAP 导入成员" onClose={onClose}>
      <div className="grid gap-4 p-5">
        <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)_auto]">
          <Select items={sourceItems} value={sourceId} disabled={sources.isLoading || imported.isPending} onValueChange={(next) => { if (next !== null) { setSelectedSourceId(next); search.reset(); } }}>
            <SelectTrigger aria-label="LDAP 身份源">
              <SelectValue placeholder="选择 LDAP 身份源" />
            </SelectTrigger>
            <SelectPopup>
              {sourceItems.map((item) => <SelectItem key={item.value || '__loading'} value={item.value}>{item.label}</SelectItem>)}
            </SelectPopup>
          </Select>
          <Input aria-label="LDAP 用户关键字" maxLength={128} placeholder="账号、姓名或邮箱" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Button type="button" size="sm" disabled={sourceId === '' || query.trim() === '' || search.isPending || imported.isPending} onClick={() => search.mutate()}>
            <Search aria-hidden className="size-3.5" />{search.isPending ? '搜索中' : '搜索'}
          </Button>
        </div>
        {sources.data?.length === 0 ? <p className="m-0 text-[12.5px] text-muted-foreground">没有启用的 LDAP 身份源</p> : null}
        {search.data?.items.length === 0 ? <p className="m-0 text-[12.5px] text-muted-foreground">未找到匹配用户</p> : null}
        {search.data?.items.length ? (
          <ul className="m-0 max-h-[420px] list-none divide-y overflow-y-auto border-y p-0">
            {search.data.items.map((user) => (
              <li key={user.dn} className="flex min-w-0 items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-foreground">{user.displayName} <span className="font-normal text-muted-foreground">({user.username})</span></div>
                  <div className="truncate text-[11.5px] text-muted-foreground" title={user.email ?? user.dn}>{user.email ?? user.dn}</div>
                </div>
                <Button type="button" size="xs" disabled={imported.isPending} onClick={() => imported.mutate(user)}>
                  <UserPlus aria-hidden className="size-3.5" />导入
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <Alert variant="error"><AlertDescription>{message(error, 'LDAP 操作失败')}</AlertDescription></Alert> : null}
      </div>
      <DialogFooter><Button type="button" variant="outline" size="sm" onClick={onClose}>关闭</Button></DialogFooter>
    </ProductDialog>
  );
}
