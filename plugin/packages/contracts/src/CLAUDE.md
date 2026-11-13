# src/
> L2 | 父级: ../CLAUDE.md

成员清单

index.ts: 公共 facade，导出经过协议生成的员工、设备、模型、插件发布与授权、Remote 及其它企业 API 类型及严格解析器。
brands.ts: 校验并构造跨模块不可混用的品牌 ID。
errors.ts: 统一错误 envelope 与稳定 HTTP status 解码。
remote.ts: Remote control/relay 手写边界，业务载荷保持加密与 Host provider 解耦。
ego.ts: 固定 Ego CDP 浏览器的精确路径、方法、严格正文和可选 capability；与 Remote wire 身份及 OpenAPI hash 解耦。
generated/: 唯一 OpenAPI 生成的 DTO、Fetch、Zod 和元数据，禁止手改。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
