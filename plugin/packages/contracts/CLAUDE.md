# contracts/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: Harness 协议包边界，说明 OpenAPI 生成、品牌 ID、错误解码和禁止手改生成物规则。
package.json: 私有 workspace package 清单，固定 Hey API、Swagger Parser、Zod 和生成漂移门禁版本。
tsconfig.json: contracts TypeScript 构建边界，仅为 Hey API Fetch 生成物局部关闭 exactOptionalPropertyTypes，其余共享严格选项不变；运行时代码不加载 Node 全局类型，可供 Console 独立构建。
scripts/generate.mjs: 校验、bundle 并解引用模块化 OpenAPI，在临时目录生成自包含 OpenAPI JSON、Hey API/strict Zod、JSON Schema、完整逻辑协议 hash 与漂移检查；固定 .js import 后缀，避免构建 cwd 改变 NodeNext 产物。
src/generated/: 从唯一 OpenAPI 真源生成含 code/refresh Token 联合类型的通用、身份/auth/device、model/quota/gateway/plugin/Session/audit DTO、Fetch client、strict Zod 与协议元数据，禁止手工编辑。
src/remote.ts: 与 HTTP OpenAPI hash 解耦的已发布 v1 握手身份和 Remote v1 control frame 的严格 Zod facade、transport/lease/capability 类型与 WebSocket URL 派生；不承载 Typert 业务 RPC。
src/ego.ts: Console/Host 共用的 Ego 0.9.14 封闭路由、严格输入/导航 schema、64KiB 正文与可选 capability。
tests/ego.spec.ts: 验证任意路径/查询/方法、登录桥、导航协议、额外字段和输入大小拒绝。
src/brands.ts: 把 OpenAPI 字符串 schema 收窄为五类不可互换的品牌 ID，并只通过 Zod 校验后构造。
src/errors.ts: 严格解码统一错误 envelope，并从生成映射返回稳定 HTTP status。
src/index.ts: contracts 公共入口，只暴露品牌 ID、错误契约和身份/设备/模型/配额/插件发布与授权/bootstrap/gateway/MCP snapshot 与本人 Remote 连接操作所需生成 DTO/Zod schema。
tests/contracts.spec.ts: 遍历 OpenAPI 正反 fixture，验证 Zod、错误码映射、bootstrap/成员/gateway、必填安装配置、发布升级的旧版 ID/包 revision 严格输入、封闭审计及秘密字段拒绝和品牌隔离。
tests/remote.spec.ts: Remote v1 control/relay fixture 边界及 Java/TypeScript 已发布握手身份回归。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
