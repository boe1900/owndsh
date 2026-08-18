# llm-gateway/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 企业受管模型 adapter 说明，定义官方 rc.7 注册面、中心直连、单次尝试、错误与凭据边界。
package.json: 私有 workspace package 清单，依赖平台/contracts 并精确声明 dsh-llm rc.7 peer。
tsconfig.json: Web Streams TypeScript 构建边界，从 `src/` 生成 ESM 与声明。
src/adapter.ts: 官方 LlmAdapter 实现，从 bootstrap 解析动态目录/default 并经平台 Service 直连中心模型流。
src/index.ts: package facade，集中导出 adapter、注册、序列化、传输、翻译与 wire 类型。
src/registration.ts: 模型目录指纹与官方 registration replace 生命周期，目录变化只发布既有 topology 事件。
src/serialize.ts: Harness 文本/reasoning/tool 历史到中心 OpenAI-compatible request 的严格映射。
src/translate.ts: 中心 reasoning/text/tool/usage/finish 到 Harness StreamChunk 的有序翻译。
src/transport.ts: 严格 `[DONE]` SSE framing、稳定错误/requestId 与 reader 取消停稳。
src/wire.ts: 中心网关请求、chunk、usage 与 tool 的内部传输词汇，不容纳 route 或 credential。
tests/adapter.spec.ts: 动态目录/default、请求 header/body、reasoning/tool/usage、错误矩阵与取消回归。
tests/registration.spec.ts: 模型事实变化触发 replace、无关状态不抖动及幂等 disposer 回归。
tests/sse.spec.ts: 分块、错误 frame/requestId、非 2xx、断流和 AbortSignal 停稳验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
