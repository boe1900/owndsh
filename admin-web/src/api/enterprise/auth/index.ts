/**
 * [INPUT]: 依赖 OpenAPI 生成的 token/logout operation 与一次性 PKCE 凭据
 * [OUTPUT]: 提供平台 Token 交换和当前管理会话注销请求
 * [POS]: api/enterprise/auth 的网络边界，禁止把 code/verifier 写入日志或持久存储
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { exchangeAuthorizationCode } from '@/services/enterprise/exchangeAuthorizationCode';
import { logoutPlatformSession } from '@/services/enterprise/logoutPlatformSession';

export interface EnterpriseTokenExchange {
  grantType: string;
  code: string;
  clientId: 'enterprise-admin';
  redirectUri: string;
  codeVerifier: string;
  installationId?: never;
}

export function exchangeEnterpriseToken(data: EnterpriseTokenExchange) {
  return exchangeAuthorizationCode(data, {
    headers: { isToken: false, repeatSubmit: false }
  });
}

export function logoutEnterpriseAdmin() {
  return logoutPlatformSession({
    headers: { repeatSubmit: false }
  });
}
