# contracts/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: Harness 协议包边界，说明 OpenAPI 生成、品牌 ID、错误解码和禁止手改生成物规则。
package.json: 私有 workspace package 清单，固定 Hey API、Swagger Parser、Zod 和生成漂移门禁版本。
tsconfig.json: contracts TypeScript 构建边界，仅为 Hey API Fetch 生成物局部关闭 exactOptionalPropertyTypes，其余共享严格选项不变。
scripts/generate.mjs: 校验并解引用 OpenAPI，在临时目录生成 Hey API/strict Zod、JSON Schema、错误状态映射与协议 hash，支持无写入漂移检查。
src/generated/: 从唯一 OpenAPI 真源生成的 DTO、Fetch client、strict Zod 与协议元数据，禁止手工编辑。
src/brands.ts: 把 OpenAPI 字符串 schema 收窄为五类不可互换的品牌 ID，并只通过 Zod 校验后构造。
src/errors.ts: 严格解码统一错误 envelope，并从生成映射返回稳定 HTTP status。
src/index.ts: contracts 公共入口，只暴露品牌 ID、错误契约和所需生成 DTO/Zod schema。
tests/contracts.spec.ts: 遍历 OpenAPI 声明的全部正反 fixture，验证 Zod、错误码映射、未知枚举拒绝和品牌隔离。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
