/**
 * [INPUT]: 依赖服务端返回的 RuoYi 用户权限码与角色集合
 * [OUTPUT]: 提供通配管理员语义一致的权限码和角色包含判断
 * [POS]: utils 的客户端展示裁剪助手，不替代服务端授权
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { UserInfo } from '@/api/system/user/types';
export function hasPermi(userInfo: UserInfo | undefined, permissions: string[]) {
  const current = userInfo?.permissions || [];
  if (current.includes('*:*:*')) return true;
  return permissions.some(permission => current.includes(permission));
}

export function hasRole(userInfo: UserInfo | undefined, roles: string[]) {
  const current = userInfo?.roles || [];
  if (current.includes('admin')) return true;
  return roles.some(role => current.includes(role));
}
