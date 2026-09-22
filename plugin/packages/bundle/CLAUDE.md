# bundle/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: npm 员工用户入口，说明 `latest` 安装、Server 登录、企业目录安装、更新卸载与兼容基线。
package.json: npm 发布清单与 `dsh.bundle`/`dsh.client` 双入口，官方 Harness 依赖锁定 `0.1.7-alpha.1`，MCP OAuth/transport 使用官方 `@modelcontextprotocol/client` v2。
screenshots.json: 社区市场从插件源码目录读取的四张原始截图清单，通过 GitHub 固定提交 URL 复用 docs/assets 媒体并控制展示顺序，不改变 npm 运行包。
tsconfig.json: bundle Host 公开声明的 emit-only TypeScript 边界，通过 workspace 声明消费产品模块，并局部跳过链接上游损坏声明检查。
cordis.patch.yml: 官方 profile layer，覆盖企业 default、停用个人 provider/模型设置与官方插件管理页，并插入企业 Host/Client；MCP resources 复用 0.1.7 base 已有 row。
scripts/build.mjs: 内联产品模块但 externalize 官方 Cordis/credentials/LLM/MCP client/resources、MCP SDK v2、tools/settings/Schemastery 与 Client ui-primitives 单例的双端构建器。
src/index.ts: Web/Desktop 共用 Host 组合入口，绑定 credentials/pi-ai/官方 pluginManager/受管插件、显式安装后重启与 mcp-runtime；MCP 仍属于唯一 owndsh-plugin，不新增 Loader row。
src/mcp-runtime.ts: 本地 MCP 路由与官方 client 子 fiber 组合器，按可信身份、公共快照、连接意愿和凭据调和；提供 connect/pause/reconnect/disconnect 与 MCP_AUTH_REQUIRED 状态；活动触发 60 秒租约验证，平台失效先关门禁，再释放连接；API Key 认证值原样放入指定 Header 并合并公共固定 headers，OAuth 固定使用本机 loopback callback。
src/mcp-tools.ts: 官方注册表的有界目录与连接代次；Agent 搜索去重累加、显式 release 管理下步集合，本步 presented 快照统一 native/PTC 执行门禁；无 LRU/会话硬预算/full 自动降级，实时撤权优先，控制工具名称冲突拒绝。
src/mcp-oauth.ts: 官方 MCP SDK v2 `OAuthClientProvider` 的宿主接缝；以确定性摘要隔离 grant，持久化官方 client information/tokens，短生命周期保存 SDK discovery/verifier 以绑定授权回调，并交接系统浏览器与 loopback callback，不实现 OAuth 协议。
tests/mcp-oauth.spec.ts: 身份/目标绑定、官方 StoredOAuth* 记录、discovery/issuer/iss 绑定、官方 SDK OAuth 委托与取消生命周期；不复制 OAuth 协议测试。
tests/mcp-runtime.spec.ts: 真实 Cordis/tools/pi-ai 与本地 HTTP MCP/模型服务验证五种模式/语言的请求正文、搜索去重累加/显式释放/本步快照/Agent隔离、完整长定义/full无隐式降级、目录与代次撤销及namespace冲突；官方client覆盖API Key原样Header、OAuth失效重授权和连接生命周期竞争；PTC使用受控bindings替身。
tests/bundle.spec.ts: 安装配置、credentials/模型/分发组合、V1 Session 停用、兼容 peers、Client graph 与构建产物验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
