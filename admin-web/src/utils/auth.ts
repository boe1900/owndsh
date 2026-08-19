/**
 * [INPUT]: 依赖浏览器 sessionStorage 的标签页级生命周期
 * [OUTPUT]: 提供固定 enterprise-admin client 标识、认证头及平台 Token 的读取、写入与清除
 * [POS]: 管理端认证事实唯一入口，统一 PKCE/HTTP/push client 绑定且禁止 Token 持久化
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const TokenKey = 'Admin-Token';
export const ENTERPRISE_ADMIN_CLIENT_ID = 'enterprise-admin' as const;

export function getToken() {
  return sessionStorage.getItem(TokenKey);
}

export function setToken(token: string) {
  sessionStorage.setItem(TokenKey, token);
}

export function removeToken() {
  sessionStorage.removeItem(TokenKey);
}

export function enterpriseAuthHeaders() {
  return {
    Authorization: `Bearer ${getToken() || ''}`,
    clientid: ENTERPRISE_ADMIN_CLIENT_ID
  };
}
