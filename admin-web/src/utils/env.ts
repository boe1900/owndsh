/**
 * [INPUT]: 依赖 Umi/Vite 注入的公开构建环境变量
 * [OUTPUT]: 提供管理端标题、API、PKCE 回调、消息与公开加密配置的只读视图
 * [POS]: admin-web 的环境配置唯一入口，不承载平台 Token 或服务端 secret
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const env = import.meta.env;

export const appEnv = {
  title: env.VITE_APP_TITLE || 'RuoYi-React-Plus后台管理系统',
  logoTitle: env.VITE_APP_LOGO_TITLE || 'RuoYi-React-Plus',
  baseApi: env.VITE_APP_BASE_API || '',
  contextPath: env.VITE_APP_CONTEXT_PATH || '/',
  adminRedirectUri: env.VITE_APP_ADMIN_REDIRECT_URI || '',
  clientId: env.VITE_APP_CLIENT_ID || '',
  encryptEnabled: env.VITE_APP_ENCRYPT === 'true',
  rsaPublicKey: env.VITE_APP_RSA_PUBLIC_KEY || '',
  rsaPrivateKey: env.VITE_APP_RSA_PRIVATE_KEY || '',
  messageEnabled: env.VITE_APP_MESSAGE_ENABLED !== 'false',
  messageTransport: (env.VITE_APP_MESSAGE_TRANSPORT || 'sse').toLowerCase(),
  messagePath: env.VITE_APP_MESSAGE_PATH || '/resource/message',
  monitorAdmin: env.VITE_APP_MONITOR_ADMIN || '',
  snailJobAdmin: env.VITE_APP_SNAILJOB_ADMIN || ''
};
