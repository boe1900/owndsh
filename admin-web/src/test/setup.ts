/**
 * [INPUT]: 依赖 jest-dom Vitest matcher、Testing Library cleanup 与 jsdom window
 * [OUTPUT]: 提供用例级 DOM 隔离及 Ant Design 所需的 matchMedia 和 ResizeObserver 测试环境
 * [POS]: src/test 的全局测试初始化，统一保证组件测试可重复且补齐 jsdom 布局观察能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { TextDecoder, TextEncoder } from 'node:util';
import { afterEach } from 'vitest';

afterEach(cleanup);

Object.assign(globalThis, { TextDecoder, TextEncoder });

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false
  })
});

class TestResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = TestResizeObserver;
