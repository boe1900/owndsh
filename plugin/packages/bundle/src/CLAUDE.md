# src/
> L2 | 父级: ../CLAUDE.md

成员清单

index.ts: Host 组合根，声明 systemPrompt 注入供 MCP admission 模式探测，绑定平台认证、模型、插件市场、MCP、技能和 Remote 生命周期；官方库存仅服务 Remote 本机能力读取，不向企业 Server 上报。
skill-provider.ts: 官方技能目录接缝，隔离企业安装根并按本机启停偏好过滤 manifest。
mcp-runtime.ts: 官方 Config 正规化、每服务器 client 子 fiber 与 SDK OAuth 连接；注册 facade 保留 child tools 的生命周期，再委托统一曝光准入。
mcp-tools.ts: 在 canonical registry 注册四档 exposure 的 when 准入；每 resolve 共用无 Agent 空 toolSet 的模式探测，实时 scope/连接代次先拒失效，正式 toolSet 与 presented 快照拒本步未声明，官方 SDK 文本按实际 renderer 重绘。
mcp-pi-search.ts: Pi vendored 英文分词与 BM25 搜索，不保存 Agent 的工具状态。
mcp-oauth.ts: 官方 MCP SDK OAuth 的凭据和浏览器授权接缝。
remote/: Remote 身份、控制连接与端到端加密载体；局部地图见 remote/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
