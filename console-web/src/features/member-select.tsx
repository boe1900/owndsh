/**
 * [INPUT]: 依赖生成的 listMembers operation、TanStack Query 与原生 select。
 * [OUTPUT]: 提供单页 loadMemberPage、完整目录 useMembers 和不允许手填 ID 的 MemberSelect。
 * [POS]: features 的产品成员选择边界，自动遍历 Server cursor 并只向业务表单返回稳定 Member ID。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useQuery } from '@tanstack/react-query';
import type { SelectHTMLAttributes } from 'react';
import { listMembers } from '@/api/generated/sdk.gen';
import type { EnterpriseErrorResponse, MemberPageData, MemberSummary } from '@/api/generated/types.gen';

const inputClass = 'h-9 w-full rounded-lg border border-line bg-canvas px-3 text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint disabled:cursor-not-allowed disabled:opacity-60';

export async function loadMemberPage(cursor?: string) {
  const result = await listMembers({ query: { limit: 200, ...(cursor ? { cursor } : {}) } });
  if (result.error !== undefined || result.data === undefined) {
    const error = result.error as EnterpriseErrorResponse | undefined;
    throw new Error(error?.error.message ?? '成员目录加载失败');
  }
  return result.data.data as MemberPageData;
}

async function loadMembers() {
  const items: MemberSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await loadMemberPage(cursor);
    items.push(...page.items);
    cursor = page.page.hasMore ? page.page.nextCursor ?? undefined : undefined;
  } while (cursor);
  return items;
}

export function useMembers(enabled = true) {
  return useQuery({
    queryKey: ['members', 'directory'],
    queryFn: loadMembers,
    enabled,
    staleTime: 60_000
  });
}

type MemberSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'onChange' | 'value'> & {
  onValueChange: (value: string) => void;
  value: string;
};

export function MemberSelect({ className = inputClass, disabled, onValueChange, value, ...props }: MemberSelectProps) {
  const members = useMembers();
  return (
    <>
      <select
        {...props}
        className={className}
        disabled={disabled || members.isLoading || members.isError}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      >
        <option value="">{members.isLoading ? '正在加载成员' : members.isError ? '成员加载失败' : '选择成员'}</option>
        {members.data?.map((member) => (
          <option key={member.id} value={member.id} disabled={member.status === 'DISABLED'}>
            {member.displayName} ({member.username}){member.status === 'DISABLED' ? ' - 已停用' : ''}
          </option>
        ))}
      </select>
      {members.isError ? <span role="alert" className="text-[12px] text-red">{members.error.message}</span> : null}
    </>
  );
}
