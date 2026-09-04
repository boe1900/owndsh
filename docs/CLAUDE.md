# docs/

> L2 | 父级: ../CLAUDE.md

成员清单

v1-product-feature-catalog.md: V1 产品功能真源，汇总身份、LDAP 用户/组目录接入、模型、授权、配额、限流、插件、设备与审计的交付状态、关键语义、发布门禁和明确非目标。
v1-e2e-acceptance.md: V1 发布验收执行真源，以真实部署、LDAP/OIDC、锁定 Harness/Desktop 和浏览器场景覆盖全部冻结能力，并记录隔离、恢复与逐项证据。
enterprise-agent-work-platform.md: 产品预研，定义企业工作平台形态、能力边界、演进阶段与商业方向。
enterprise-agent-governance-mvp-design.md: MVP 实施真源，定义冻结决策、模块、API、数据表、测试、T00-T23 顺序和验收标准。
phase-2-product-console-design.md: 第二阶段产品化实施真源，冻结 TanStack/Beautiful UI 控制台、成员多身份、LDAP 目录组映射、集合授权，以及 TOKEN 多窗口、组织级供应商与其他资源 RATE 瞬时限流结构。
desktop-2.0.3-harness-rc2-migration.md: 当前 Desktop 发行基线迁移证据，记录 Desktop→Harness 派生锁、上游变化、企业适配、行为风险与 Web/Desktop 门禁结果。
t00-baseline-acceptance.md: T00 独立验收证据，记录初始导入与 rc.7 重新基线的环境、命令、真实 consumer 和退出结论。
t01-technical-spike-acceptance.md: T01 独立验收证据，保留 Typert 路线误判分析并记录官方插件路线、正式模块、测试与真实 Harness Web 结果。
t02-contract-foundation-acceptance.md: T02 独立验收证据，记录 OpenAPI 真源、跨语言生成、严格 fixture、真实包消费和版本锁结论。
t03-server-database-acceptance.md: T03 独立验收证据，记录 PostgreSQL migration、RBAC、密码学、revision 与审计事务结果。
t04-identity-adapter-acceptance.md: T04 独立验收证据，记录三类身份 adapter、绑定/组映射、管理 API、cursor、协议与秘密隔离结果。
t05-pkce-device-acceptance.md: T05 独立验收证据，记录 PKCE/Redis 原子状态、Sa-Token terminal、验证码、设备生命周期，以及 T22 两阶段首次改密修订。
t06-harness-platform-client-acceptance.md: T06 独立验收证据，记录 platform-client Service、Token/installation 边界、刷新退避、本地 API/SSE、tgz consumer 与锁定 Harness 组合结果。
t07-employee-login-ui-acceptance.md: T07 独立验收证据，记录官方三 slot 路线、共享账号状态、十态文案、无 Token 浏览器边界和真实桌面流程。
t08-model-management-acceptance.md: T08 独立验收证据，记录模型治理 API、provider 密钥隔离、默认授权解析、PostgreSQL 事务与 bootstrap 模型目录。
t09-quota-management-acceptance.md: T09 独立验收证据，记录叠加配额、冻结时区、并发预留、Redis lease、结算恢复、用量协议与锁序审阅。
t10-model-gateway-acceptance.md: T10 独立验收证据，记录请求级授权、三协议透明 SSE、精确伪拒绝重试、2xx 后 SENT、配额终态、审计原子性与敏感信息隔离。
t11-harness-model-integration-acceptance.md: T11 独立验收证据，记录 rc.7 官方 dsh-llm-pi-ai、动态三协议 profile/default、本机认证代理、真实 ctx.llm 流与 Agent 瞬时失败恢复。
t12-admin-console-acceptance.md: T12 独立验收证据，记录管理 PKCE、治理纵向页面、真实 Server E2E、CAS 恢复、密钥隔离和跨端门禁。
t13-plugin-server-acceptance.md: T13 独立验收证据，记录流式验包、JCS/Ed25519、CAS、状态/分配、下载授权、库存、协议与真实 PostgreSQL 事务结果。
t14-plugin-client-acceptance.md: T14 独立验收证据，记录下载验签、官方 CLI argv、原子状态、重启确认、回滚、树外 consumer 与真实 rc.7 CLI 结果。
t15-plugin-pages-acceptance.md: T15 独立验收证据，记录管理插件页面、完整 assignment CAS、设备 inventory、员工插件 tab 与真实 rc.7 重启闭环。
t16-session-server-acceptance.md: T16 独立验收证据，记录官方 format v0、精确 JSONL/hash、源设备并发复制、AES-GCM、正文权限、tombstone 与 retention。
t17-session-client-acceptance.md: T17 独立验收证据，记录 dirty queue、确认游标、退避终态、树外 consumer 与锁定 rc.7 同步恢复链路。
t18-session-pages-acceptance.md: T18 独立验收证据，记录管理正文权限/审计/tombstone、员工同步/恢复/删除与 rc.7 重启不重传。
t19-audit-closure-acceptance.md: T19 独立验收证据，记录 30-action metadata 白名单、requestId 关联、只读权限、retention、用户治理和 heartbeat 防洪。
t20-security-fault-acceptance.md: T20 独立验收证据，记录分层安全上限、drain、秘密扫描、服务/磁盘故障与四类恢复演练。
t21-deployment-delivery-acceptance.md: T21 独立验收证据，记录 Linux amd64 release、TLS Compose、一次性管理员、secret、健康检查、数据/key 分离恢复、升级与仅应用回滚。
t22-manual-acceptance.md: T22 人工验收真源，记录自动总编排退役决策、单后端/单 Harness 启动方式与逐功能确认清单。
assets/: 无密钥验收媒体，保存 T05、T07、T12、T15、T18、T19 的真实页面流程截图/GIF；局部地图见 assets/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
