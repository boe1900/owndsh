/**
 * [INPUT]: 依赖 @testing-library/react re-export 的全局 configure（dom 为其传递依赖，pnpm 边界下不可直引）。
 * [OUTPUT]: 提供全套件统一的 Testing Library 异步查询预算（默认 1s → 5s），避免高负载环境下 findBy* 误报。
 * [POS]: src/test 的唯一 Vitest setupFiles 入口，由 vite.config.ts 的 test.setupFiles 挂载，全部测试文件隐式共享。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { configure } from '@testing-library/react';

configure({ asyncUtilTimeout: 5000 });
