# src/
> L2 | 父级: ../CLAUDE.md

成员清单

index.ts: Host 组合根，绑定平台认证、模型、插件市场、MCP、技能和 Remote 生命周期；官方库存仅服务 Remote 本机能力读取，不向企业 Server 上报。
skill-provider.ts: 官方技能目录接缝，隔离企业安装根并按本机启停偏好过滤 manifest。
mcp-runtime.ts: 官方 MCP client 子 fiber 的连接、认证与工具呈现编排。
mcp-tools.ts: MCP 工具目录、四档 exposure 与 Agent 下一轮发现状态，复用官方执行入口。
mcp-pi-search.ts: Pi vendored 英文分词与 BM25 搜索，不保存 Agent 的工具状态。
mcp-oauth.ts: 官方 MCP SDK OAuth 的凭据和浏览器授权接缝。
remote/: Remote 身份、控制连接与端到端加密载体；局部地图见 remote/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
