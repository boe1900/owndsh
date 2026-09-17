# bundle/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: npm 员工用户入口，说明 `latest` 安装、Server 登录、企业目录安装、更新卸载与兼容基线。
package.json: npm 发布清单与 `dsh.bundle`/`dsh.client` 双入口，官方 Harness 依赖声明 `^0.1.5-rc.2` peer 范围；显式 peer/dev 依赖 MCP SDK 1.30.0 用于 OAuth discovery；Client 只声明设置/门禁两个所用 slot 的所有者，避免依赖新版已退役的 client-runtime row。
screenshots.json: 社区市场从插件源码目录读取的四张原始截图清单，通过 GitHub 固定提交 URL 复用 docs/assets 媒体并控制展示顺序，不改变 npm 运行包。
tsconfig.json: bundle Host 公开声明的 emit-only TypeScript 边界，通过 workspace 声明消费产品模块，并局部跳过链接上游损坏声明检查。
cordis.patch.yml: 官方 profile layer，覆盖企业 default、停用个人 provider/模型设置并插入企业 Host/Client row。
scripts/build.mjs: 内联产品模块但 externalize 官方 Cordis/credentials/LLM/MCP client/tools/settings/Schemastery、MCP SDK 与 Client ui-primitives 单例的双端构建器。
src/index.ts: Web/Desktop 共用 Host 组合入口，绑定 credentials/pi-ai/受管插件、显式安装后重启与 mcp-runtime；MCP 仍属于唯一 owndsh-plugin，不新增 Loader row。
src/mcp-runtime.ts: 本地 MCP 路由与官方 client 子 fiber 组合器，按可信身份、公共快照、连接意愿和凭据调和；提供 connect/pause/reconnect/disconnect 与 MCP_AUTH_REQUIRED 状态；活动触发 60 秒租约验证，平台失效先关门禁，再释放连接；API Key 认证值原样放入指定 Header 并合并公共固定 headers，OAuth 固定使用本机 loopback callback。
src/mcp-tools.ts: 官方注册表的有界目录与连接代次；Agent 搜索去重累加、显式 release 管理下步集合，本步 presented 快照统一 native/PTC 执行门禁；无 LRU/会话硬预算/full 自动降级，实时撤权优先，控制工具名称冲突拒绝。
src/mcp-oauth.ts: 以文件内确定性 JSON 摘要从 bootstrap 身份与公共目标隔离 MCP grant；access token 仅内存，refresh/API Key 与动态 public clientId 走官方原子记录，复用 PKCE loopback/DCR，授权/发现/注册/交换/刷新统一接受管理员指定的 HTTP(S)，保留 userinfo/片段/重定向拒绝和 issuer/resource 绑定，区分失效授权与瞬时刷新失败，阻断取消/销毁后的迟到写入。
tests/mcp-oauth.spec.ts: 身份/目标绑定、严格记录、仅内存 access token、rotation/invalid_grant 与取消提交回退；SDK PRM/AS discovery 的 mismatch/redirect/成功 fixture；真实 HTTP provider 覆盖手工端点、发现、动态注册、PKCE loopback 授权与自动刷新，不改写 fetch URL。
tests/mcp-runtime.spec.ts: 真实 Cordis/tools/pi-ai 与本地 HTTP MCP/模型服务验证五种模式/语言的请求正文、搜索去重累加/显式释放/本步快照/Agent隔离、完整长定义/full无隐式降级、目录与代次撤销及namespace冲突；官方client覆盖API Key原样Header、OAuth失效重授权和连接生命周期竞争；PTC使用受控bindings替身。
tests/bundle.spec.ts: 安装配置、credentials/模型/分发组合、V1 Session 停用、兼容 peers、Client graph 与构建产物验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
