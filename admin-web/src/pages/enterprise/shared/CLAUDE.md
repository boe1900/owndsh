# shared/

> L2 | 父级: ../CLAUDE.md

成员清单

revision.ts: 识别 revision 冲突并执行页面提供的服务端事实重载，不重试写请求。
useCursorData.ts: 管理服务端签名 cursor 的首屏、追加与刷新状态，禁止前端解析 cursor。
validateForm.ts: 收敛 Ant Design 表单校验拒绝为无提交结果，避免按钮事件产生未处理 Promise。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
