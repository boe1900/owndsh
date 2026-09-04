# llm-gateway/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 企业受管模型配置桥说明，冻结官方协议所有权与企业治理边界。
package.json: 私有 workspace package 清单，只直接依赖平台客户端并按官方 caret 规则声明 dsh-llm-pi-ai 兼容 peer。
tsconfig.json: Node/Web Streams ESM 声明边界，仅跳过链接上游 Anthropic SDK 的损坏声明检查。
src/index.ts: package facade，只导出 profile、认证代理与官方插件注册三个边界。
src/profiles.ts: 将 bootstrap 模型事实和短生命期代理 bearer 按三种 wire API/SDK base URL 约定投影为 PiAi profiles/default sentinel，不覆盖官方 provider 重试策略。
src/proxy.ts: 自有随机端口与 bearer 的 Host 私有 loopback 代理，透明 relay 原生 JSON/SSE 与 Retry-After，并把非重试 429 标记为官方 pi-ai 可识别的终态 quota 错误。
src/registration.ts: 启停 Host 私有代理并挂载官方 dsh-llm-pi-ai，按 bootstrap profile 指纹动态更新其 Cordis fiber。
tests/profiles.spec.ts: 验证三协议 route、SDK base URL、default sentinel、容量、reasoningEfforts 纯投影与官方重试默认值继承。
tests/proxy.spec.ts: 验证未授权本机请求被拒绝、透明 relay、终态 quota 分类、平台 SSE/JSON 双媒体声明和伪认证隔离。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
