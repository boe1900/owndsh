/**
 * [INPUT]: 依赖 @testing-library/react configure 与浏览器环境全局 stub。
 * [OUTPUT]: 提供全套件统一的异步查询预算，以及 jsdom 缺失的 matchMedia、ResizeObserver 和 cookieStore 最小垫片以支撑 coss/Base UI 组件测试。
 * [POS]: src/test 的唯一 Vitest setupFiles 入口，由 vite.config.ts 的 test.setupFiles 挂载，全部测试文件隐式共享。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { configure } from '@testing-library/react';

configure({ asyncUtilTimeout: 5000 });

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    })
  });
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof globalThis.cookieStore === 'undefined') {
  Object.defineProperty(globalThis, 'cookieStore', {
    writable: true,
    value: {
      set: async () => undefined,
      get: async () => null
    }
  });
}

if (typeof Element !== 'undefined' && typeof Element.prototype.getAnimations !== 'function') {
  Element.prototype.getAnimations = () => [];
}
