# remote/

> L2 | 父级: ../CLAUDE.md

成员清单

remote-api.ts: Remote 管理 API 的同源 Cookie fetch、设备/ticket DTO 和 WebSocket URL 派生。
remote-controller.ts: 浏览器 controller carrier 的 hello、ticket connect、Relay fallback 和 lease watchdog。
remote-state.ts: controller 侧连接状态机与稳定错误码映射，禁止通过布尔值拼接 lifecycle。
remote-page.tsx: 设备列表、ticket 申请、连接阶段和诊断面板；P0 不渲染 Session/File/Terminal 业务。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
