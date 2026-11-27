/**
 * [INPUT]: 依赖生成的 listMembers operation、TanStack Query 与 coss UI Select/Alert。
 * [OUTPUT]: 提供单页 loadMemberPage、完整目录 useMembers 和不允许手填 ID 的 MemberSelect。
 * [POS]: features 的产品成员选择边界，自动遍历 Server cursor 并只向业务表单返回稳定 Member ID。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useQuery } from '@tanstack/react-query';
import { listMembers } from '@/api/generated/sdk.gen';
import type { EnterpriseErrorResponse, MemberPageData, MemberSummary } from '@/api/generated/types.gen';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from '@/components/ui/select';

export async function loadMemberPage(cursor?: string) {
  const result = await listMembers({ query: { limit: 200, ...(cursor ? { cursor } : {}) } });
  const page = result.data?.data;
  if (result.error !== undefined || !page || !Array.isArray(page.items) || !page.page) {
    const error = result.error as EnterpriseErrorResponse | undefined;
    throw new Error(error?.error.message ?? '成员目录加载失败');
  }
  return page as MemberPageData;
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

type MemberSelectProps = {
  'aria-label'?: string;
  className?: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  value: string;
};

export function MemberSelect({ 'aria-label': ariaLabel = '成员', className, disabled, onValueChange, value }: MemberSelectProps) {
  const members = useMembers();
  const placeholder = members.isLoading ? '正在加载成员' : members.isError ? '成员加载失败' : '选择成员';
  const items = [
    { value: '', label: placeholder },
    ...(members.data ?? []).map((member) => ({
      value: member.id,
      label: `${member.displayName} (${member.username})${member.status === 'DISABLED' ? ' - 已停用' : ''}`,
      disabled: member.status === 'DISABLED'
    }))
  ];

  return (
    <>
      <Select
        items={items}
        disabled={disabled || members.isLoading || members.isError}
        value={value}
        onValueChange={(next) => onValueChange(next ?? '')}
      >
        <SelectTrigger aria-label={ariaLabel} className={className}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectPopup>
          {items.map((item) => (
            <SelectItem key={item.value || '__empty__'} value={item.value} disabled={'disabled' in item ? item.disabled : false}>
              {item.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      {members.isError ? (
        <Alert variant="error">
          <AlertDescription>{members.error.message}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
