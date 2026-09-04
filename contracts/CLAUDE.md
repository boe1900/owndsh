# contracts/

> L2 | 父级: ../CLAUDE.md

成员清单

README.md: 协议真源使用规则，定义手写与生成边界、双端消费方式和漂移门禁。
enterprise-openapi.yaml: OpenAPI 3.1 逻辑协议导航根，定义 Bearer 与 HTTP/HTTPS 管理端 Cookie、40 个稳定错误码和 97 个 operation，并引用受控 Path Item/schema 分片。
paths/: identity/auth/member/device/model/quota/gateway/plugin/session/audit operation 分片目录；局部地图见 paths/CLAUDE.md。
components/: 身份治理、认证、成员、设备、模型、配额、网关、插件、Session 与审计协议 schema 分片；局部地图见 components/CLAUDE.md。
fixtures/auth-sources-success.json: T05 登录事务、CSRF 与公开身份源成功响应样例。
fixtures/device-list-success.json: T05 管理设备 cursor 列表成功响应样例。
fixtures/device-success.json: T05 单设备 enroll/heartbeat/get/revoke 统一成功响应样例。
fixtures/group-mapping-success.json: P2-08A 外部组到产品用户组映射成功响应样例。
fixtures/group-mapping-list-success.json: T04 外部组映射空列表成功响应样例。
fixtures/deleted-resource-success.json: T04 组映射 CAS 删除确认成功响应样例。
fixtures/identity-source-list-success.json: T04 身份源空列表成功响应样例。
fixtures/identity-source-secret-leak.json: 身份源响应夹带 secret 的严格 schema 负例，证明秘密字段无法进入协议。
fixtures/identity-source-success.json: OIDC JIT 身份源脱敏成功响应样例，只暴露 provisioningMode 与 secretConfigured。
fixtures/identity-source-test-success.json: T04 身份源连接检查的脱敏 READY 响应样例。
fixtures/ldap-user-search-success.json: P2-08B LDAP 用户有界发现成功响应样例，只包含 DN 与统一成员字段。
fixtures/ldap-member-import-success.json: P2-08B LDAP 单人导入按稳定 subject 返回成员 ID 与创建状态的成功响应样例。
fixtures/ldap-group-search-success.json: P2-08B LDAP 组有界发现成功响应样例，只包含 Group DN 与显示名。
fixtures/external-identity-summary-success.json: 成员外部身份摘要成功响应样例，不暴露 provider secret 或原始 claims。
fixtures/access-group-success.json: P2-08A 扁平用户组、手工成员和有效成员数成功响应样例。
fixtures/provider-success.json: T08 provider 脱敏详情成功样例，只暴露 credentialConfigured。
fixtures/provider-secret-leak.json: provider 响应夹带 credential 的严格 schema 负例。
fixtures/provider-list-success.json: T08 provider cursor 列表成功样例。
fixtures/provider-probe-success.json: T08 provider test 脱敏成功/延迟/状态类别与模型候选样例。
fixtures/model-success.json: T08 受管模型详情成功样例。
fixtures/model-list-success.json: T08 受管模型 cursor 列表成功样例。
fixtures/model-set-success.json: P2-08A 扁平模型集与完整模型成员成功响应样例。
fixtures/model-grant-success.json: P2-08A 单条 ACCESS_GROUP 到 MODEL_SET 授权成功样例。
fixtures/model-grant-list-success.json: T08 模型授权 cursor 列表成功样例。
fixtures/model-grant-batch-success.json: T08 原子批量授权成功样例。
fixtures/bootstrap-models-success.json: T22 ACTIVE 设备完整 bootstrap 外壳、有效模型目录与 V1 已停用 Session 策略样例。
fixtures/quota-policy-success.json: P2-08A 成员/模型集 TOKEN policy 与 nullable 四窗口 limits 成功样例。
fixtures/quota-policy-list-success.json: T09 quota policy 空 cursor page 成功样例。
fixtures/quota-window-list-success.json: T09 当前自然日窗口计数与 reset time 成功样例。
fixtures/quota-usage-me-success.json: P2-08A 员工生效 TOKEN 策略的资源范围与四窗口实时计数样例。
fixtures/usage-ledger-list-success.json: T09 管理端 prompt-free ledger、cursor 与聚合成功样例。
fixtures/gateway-request-success.json: T10/T11 default sentinel 与官方 adapter 原生字段透明传输成功请求样例。
fixtures/plugin-version-success.json: T13 VALIDATED 插件版本、签名和 compatibility 成功响应样例。
fixtures/plugin-assignments-success.json: T13 USER/DEPT/ALL 裁决后的 runtime 插件分配成功响应样例。
fixtures/plugin-inventory-success.json: T13 ACTIVE 设备原子替换本地插件库存的成功响应样例。
fixtures/session-batch-success.json: T16 精确事件批次确认序列与 rolling hash 成功响应样例。
fixtures/session-list-success.json: T16 员工本人 ACTIVE 远端副本与解密标题 cursor 列表成功样例。
fixtures/session-export-success.json: T16 官方 v0 header、精确 JSONL payload 与前后 hash 证明成功样例。
fixtures/admin-session-list-success.json: T16 不解密正文的管理 metadata cursor 列表成功样例。
fixtures/session-deleted-success.json: T16 正文清除并保留 DELETED tombstone 成功响应样例。
fixtures/audit-event-list-success.json: T19 同 requestId 的模型 accepted/finished 双记录与封闭 metadata 成功响应样例。
fixtures/protocol-page-success.json: 带品牌 ID、revision 和 cursor page metadata 的成功响应样例。
fixtures/protocol-success.json: 最小统一成功响应样例，验证 data/requestId envelope。
fixtures/quota-error.json: 带固定 QuotaExceededDetails 的第 17 节失败响应样例。
fixtures/token-success.json: T05 12 小时 dsh-desktop Bearer Token 成功响应样例，只使用显式假值。
fixtures/console-bootstrap-success.json: P2-03 产品控制台当前账号、多登录来源、固定角色、权限码与部署标识成功响应样例，不含外部 subject、菜单和部门。
fixtures/member-list-success.json: P2-06 成员固定角色与 LOCAL/OIDC 登录方式聚合成功样例。
fixtures/member-detail-success.json: P2-06 成员详情、稳定身份、设备与 Session 摘要成功样例，不含部门和原始 claims。
fixtures/unexpected-error-property.json: 包含未声明调试字段的失败响应负例，验证 additionalProperties=false 在双端严格生效。
fixtures/unknown-error-code.json: 未知稳定错误码负例，必须被 Java JSON Schema 与 TypeScript Zod 同时拒绝。
generated/: 从完整 OpenAPI 逻辑文档派生的自包含 OpenAPI JSON、fixture manifest、JSON Schema 与协议 SHA-256，供管理端、Java 和 CI 消费，禁止手工编辑。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
