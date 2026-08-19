/**
 * [INPUT]: 依赖 Umi/Vite 公开环境变量、静态资源模块与 import.meta.glob 运行时
 * [OUTPUT]: 提供 admin-web 全局编译期环境和资源类型声明
 * [POS]: src 的环境类型边界，只声明公开构建输入，不声明业务 DTO 或秘密
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string;
  readonly VITE_APP_LOGO_TITLE?: string;
  readonly VITE_APP_BASE_API?: string;
  readonly VITE_APP_CONTEXT_PATH?: string;
  readonly VITE_APP_ADMIN_REDIRECT_URI?: string;
  readonly VITE_APP_ENV?: string;
  readonly VITE_APP_PORT?: string;
  readonly VITE_APP_CLIENT_ID?: string;
  readonly VITE_APP_ENCRYPT?: string;
  readonly VITE_APP_RSA_PUBLIC_KEY?: string;
  readonly VITE_APP_RSA_PRIVATE_KEY?: string;
  readonly VITE_APP_MESSAGE_ENABLED?: string;
  readonly VITE_APP_MESSAGE_TRANSPORT?: string;
  readonly VITE_APP_MESSAGE_PATH?: string;
  readonly VITE_APP_MONITOR_ADMIN?: string;
  readonly VITE_APP_SNAILJOB_ADMIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  glob: <T = unknown>(pattern: string, options: { eager: true; as: 'url' }) => Record<string, T>;
}

declare module '*.less';
declare module '*.css';
declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.webp';
declare module '*.gif';
declare module '*.svg';
declare module 'antd/dist/reset.css';
