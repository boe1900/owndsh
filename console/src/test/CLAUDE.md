# test/

> L2 | 父级: ../CLAUDE.md

成员清单

setup.ts: Vitest 全局 setupFiles 入口，把 Testing Library 异步查询预算统一放宽到 5 秒，并提供 `window.matchMedia`、`ResizeObserver`、`cookieStore` 与 `Element.prototype.getAnimations` jsdom 最小垫片以支撑 coss/Base UI 组件测试；不持有业务 mock。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
