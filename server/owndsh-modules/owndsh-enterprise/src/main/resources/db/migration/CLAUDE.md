# db/migration/

> L2 | 父级: ../../../../../CLAUDE.md

成员清单

V1__enterprise_core.sql: 建立身份、设备、模型、配额、插件和 Session 核心企业事实表及约束。
V2__enterprise_plugin.sql: 建立插件制品、版本、分配和设备状态持久化结构。
V3__enterprise_session.sql: 建立远端 Session replica/event/batch、密文字段和保留状态结构。
V4__enterprise_audit.sql: 建立只追加审计、固定 built-in 角色、菜单、权限码与不可变触发器。
V5__enterprise_seed.sql: 为默认 tenant 写入 LOCAL 身份源、DEFAULT 配额策略和 BOOTSTRAP revision。
V6__enterprise_quota_runtime.sql: 冻结部署 IANA 时区，并给 reservation 增加崩溃恢复所需 requestId。
V7__enterprise_admin_observability.sql: 持久化身份源最近连接测试与设备 heartbeat 的插件/同步脱敏摘要，供 T12 管理投影读取。
V8__enterprise_plugin_server.sql: 把历史 ACTIVE/DISABLED assignment 前向迁移为 INSTALLED/ABSENT，并冻结 T13 客户端调和库存状态约束。
V9__enterprise_session_format.sql: 前向修正官方 rc.7 Session format v0 约束，并补齐 hash 长度与 retention 扫描索引。
V10__enterprise_audit_query.sql: 为 tenant 隔离的 audit cursor 查询与有界 retention 清理补齐复合索引。
V11__enterprise_heartbeat_audit_throttle.sql: 持久化设备最近 heartbeat 审计时间，供数据库行锁内原子执行一小时成功审计限频。
V12__enterprise_deployment_bootstrap.sql: 建立无 secret 部署标记与 LOCAL 首次改密字段；按精确已知 hash 退役基线账号且保留历史外键，清除已知 client secret。
V13__enterprise_provider_configuration.sql: 增加 Harness providerKey 与 API 协议，将旧兼容网关保守迁为 CUSTOM，并约束 DeepSeek 官方保留路由。
V14__enterprise_harness_model_profile.sql: 将模型配置校正为 Harness 可选 name/contextWindow/maxTokens 并删除伪造 reasoning 能力列，保留 append-only 历史审计。
V15__enterprise_model_reasoning_profile.sql: 增加 pi-ai reasoningEfforts false/object 三态与 completions compat JSONB 模型事实，数据库只约束顶层形状并由领域层校验具体档位。
V16__product_navigation.sql: 将 Host 与企业菜单收敛为 Agent 管控、系统设置和运行状态三组产品导航，并停用已裁模块及上游宣传入口。
V17__enterprise_admin_system_access.sql: 将系统设置与运行状态的有效菜单授予 enterprise_admin，并在版本化变更后恢复内置角色权限不可变保护。
V18__product_access_scopes.sql: 破坏性删除部门模型授权/配额及其窗口快照、旧变更审计，将 USER/DEFAULT 收敛为 MEMBER/ORGANIZATION，移除 grant 默认标记并让种子 Token 上限默认无限。
V19__product_member_read_permission.sql: 新增独立成员目录读取权限并授予企业、模型和插件管理员，避免复用身份源或业务写权限。
V20__product_member_management.sql: 为 sys_user 增加 revision 与成员写权限，只允许 enterprise_admin 执行角色和状态治理。
V21__product_member_identity_unlink.sql: 将 USER_UNLINKED 加入数据库审计 action 白名单，不改写已有事件。
V22__identity_source_provisioning_mode.sql: 增加 JIT/LINK_ONLY 身份源生命周期约束，现有 OIDC/LDAP 保持 JIT、LOCAL 固定 LINK_ONLY。
V23__product_usage_read_permission.sql: 新增独立用量读取权限，并收回 auditor 对模型、授权和设备管理 API 的历史读取能力。
V24__model_sets_and_token_windows.sql: 建立扁平用户组/模型集与来源成员关系，把模型授权扩展到集合资源，并增加按模型范围生效的 5 小时/日/周/月 Token 窗口。
V25__separate_token_and_rate_policies.sql: 为共享策略持久化边界增加 TOKEN/RATE 判别与字段互斥约束，拒绝累计量和瞬时流量混填。
V26__provider_rate_limits.sql: 扩展资源范围为组织级供应商 RATE，拒绝成员级或 Token 供应商策略。
V27__one_rate_limit_per_provider.sql: 以局部唯一索引保证每个供应商至多一条共享 RATE 容量策略，支持提供商表单单值投影。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
