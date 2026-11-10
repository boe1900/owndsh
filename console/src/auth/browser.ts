/**
 * [INPUT]: 依赖生成的浏览器账号/客户端授权 API 与同源 HttpOnly Cookie。
 * [OUTPUT]: 提供无管理权限依赖的账号读取与一次性授权，统一检查 401 和 loopback 回调。
 * [POS]: auth 的浏览器身份与客户端授权边界，供账号确认页和新鲜登录完成流程共用，不读取 Token。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { decideBrowserAuthorization, getBrowserIdentity } from '@/api/generated/sdk.gen';
import type { AuthSourcesData, BrowserMember } from '@/api/generated/types.gen';
import { AuthRequiredError } from './session';

export async function loadBrowserIdentity() {
  const result = await getBrowserIdentity();
  if (result.response?.status === 401) throw new AuthRequiredError();
  if (result.error || !result.data) throw result.error ?? new Error('ENT_PLATFORM_UNAVAILABLE');
  return result.data.data;
}

export async function decideClientAuthorization(
  transaction: Pick<AuthSourcesData, 'transactionId' | 'csrfToken'>, member: BrowserMember, approved: boolean
) {
  const result = await decideBrowserAuthorization({ body: {
    transactionId: transaction.transactionId, csrfToken: transaction.csrfToken, userId: member.id, approved
  } });
  if (result.response?.status === 401) throw new AuthRequiredError();
  if (result.error || !result.data) throw new Error('ENT_AUTH_SESSION_EXPIRED');
  const callback = new URL(result.data.data.redirectUri);
  if (callback.protocol !== 'http:' || callback.hostname !== '127.0.0.1'
    || callback.pathname !== '/callback' || !callback.port || callback.username || callback.password) {
    throw new Error('ENT_INVALID_REDIRECT_URI');
  }
  return callback.toString();
}
