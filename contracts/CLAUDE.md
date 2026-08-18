# contracts/

> L2 | 父级: ../CLAUDE.md

成员清单

README.md: 协议真源使用规则，定义手写与生成边界、双端消费方式和漂移门禁。
enterprise-openapi.yaml: OpenAPI 3.1 逻辑 HTTP 协议根，定义通用边界、T04 operations 并引用受控 schema 分片。
components/: 协议 schema 分片目录；T04 身份治理组件见 components/CLAUDE.md。
fixtures/group-mapping-success.json: T04 外部组到部门映射成功响应样例。
fixtures/group-mapping-list-success.json: T04 外部组映射空列表成功响应样例。
fixtures/deleted-resource-success.json: T04 组映射 CAS 删除确认成功响应样例。
fixtures/identity-source-list-success.json: T04 身份源空列表成功响应样例。
fixtures/identity-source-secret-leak.json: 身份源响应夹带 secret 的严格 schema 负例，证明秘密字段无法进入协议。
fixtures/identity-source-success.json: T04 OIDC 身份源脱敏成功响应样例，只暴露 secretConfigured。
fixtures/identity-source-test-success.json: T04 身份源连接检查的脱敏 READY 响应样例。
fixtures/protocol-page-success.json: 带品牌 ID、revision 和 cursor page metadata 的成功响应样例。
fixtures/protocol-success.json: 最小统一成功响应样例，验证 data/requestId envelope。
fixtures/quota-error.json: 带固定 QuotaExceededDetails 的第 17 节失败响应样例。
fixtures/unexpected-error-property.json: 包含未声明调试字段的失败响应负例，验证 additionalProperties=false 在双端严格生效。
fixtures/unknown-error-code.json: 未知稳定错误码负例，必须被 Java JSON Schema 与 TypeScript Zod 同时拒绝。
generated/: 从 OpenAPI components 派生的自包含 JSON Schema 与协议 SHA-256，供 Java 和 CI 消费，禁止手工编辑。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
