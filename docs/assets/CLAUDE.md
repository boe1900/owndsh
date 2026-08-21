# assets/

> L2 | 父级: ../CLAUDE.md

成员清单

t05-auth-flow.gif: T05 公开登录页的真实浏览器流程。
t07-01-signed-out.png: T07 Harness 企业账号未登录状态。
t07-02-authorizing.png: T07 Harness 企业账号等待授权状态。
t07-03-cancelled.png: T07 Harness 企业登录取消状态。
t07-04-ready.png: T07 Harness 企业账号 READY 状态。
t07-05-auth-expired.png: T07 Harness 企业账号认证过期状态。
t07-06-device-revoked.png: T07 Harness 企业设备撤销状态。
t07-employee-login.gif: T07 员工登录 UI 的真实桌面流程。
t12-01-admin-login.png: T12 管理端企业登录入口。
t12-02-identity-sources.png: T12 身份源配置与脱敏状态。
t12-03-managed-models.png: T12 受管模型目录与授权结果。
t12-04-active-device.png: T12 ACTIVE 设备管理事实。
t12-05-revoked-device.png: T12 设备撤销后的服务端事实。
t12-admin-console.gif: T12 管理控制台真实纵向流程。
t15-01-admin-login.png: T15 管理端企业登录入口。
t15-02-plugin-catalog.png: T15 插件 catalog、版本状态与完整 assignment 集合。
t15-03-plugin-inventory.png: T15 设备插件 ACTIVE inventory。
t15-04-harness-restart-required.png: T15 Harness 员工插件等待重启状态。
t15-05-harness-active.png: T15 Harness Loader 确认插件已启用状态。
t15-plugin-pages.gif: T15 管理端到 Harness 的真实插件页面闭环。
t18-01-admin-session-content.png: T18 管理员拥有独立正文权限时的 Session 时间线。
t18-02-auditor-session-content.png: T18 审计员只读正文且无删除入口的权限裁剪。
t18-03-session-deleted.png: T18 ACTIVE Session 删除后的 DELETED tombstone 管理事实。
t18-04-harness-session-restored.png: T18 锁定 rc.7 Harness 跨设备恢复并上传新本地副本。
t18-05-harness-session-deleted.png: T18 员工删除恢复副本后的 DELETED 不重传游标。
t18-session-pages.gif: T18 员工登录、远端列表、恢复、删除确认与删除完成的真实桌面流程。
t19-01-request-id-correlation.png: T19 管理员按模型 requestId 查询 accepted/finished 双审计记录。
t19-02-metadata-whitelist.png: T19 显式 metadata 抽屉仅展示模型调用计数与关联 ID。
t19-03-auditor-read-only.png: T19 审计员只读查询相同 requestId 且无治理写入口。
t19-audit-closure.gif: T19 requestId 关联、metadata 白名单与审计员只读权限的真实管理端流程。
t22-01-candidate-governance.png: T22 正式候选管理端 OIDC READY、配置脱敏与隔离 TLS 端点。
t22-02-harness-model-ready.png: T22 锁定 rc.7 Harness 企业账号、设备、平台和 bundle 连接事实。
t22-03-plugin-rollback-active.png: T22 真实双版本受管插件回滚后的本地版本、assignment 与 Loader 状态。
t22-04-session-restored.png: T22 第二台 Harness 恢复新 Session ID、确认游标和远端副本列表。
t22-05-audit-tombstone.png: T22 审计闭环完成后管理端 Session tombstone 页面。
t22-end-to-end-candidate.gif: T22 身份、模型、插件、Session 恢复与 tombstone 的正式 release 关键流程。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
