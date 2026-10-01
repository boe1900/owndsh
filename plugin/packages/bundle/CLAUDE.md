# bundle/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: npm 员工用户入口，说明 `next` 安装、Server 登录、企业目录安装、更新卸载与兼容基线。
package.json: npm 发布清单与 `dsh.bundle`/`dsh.client` 双入口，官方 Harness 依赖锁定 `0.2.0-rc.1`，MCP OAuth/transport 使用官方 `@modelcontextprotocol/client` v2，检索使用 Pi vendored 英文 BM25 纯逻辑。
screenshots.json: 社区市场从插件源码目录读取的四张原始截图清单，通过 GitHub 固定提交 URL 复用 docs/assets 媒体并控制展示顺序，不改变 npm 运行包。
tsconfig.json: bundle Host 公开声明的 emit-only TypeScript 边界，通过 workspace 声明消费产品模块，并局部跳过链接上游损坏声明检查。
cordis.patch.yml: 官方 profile layer，覆盖企业 default、停用 API Key/个人账号 provider 与模型设置并插入 OwnDsh；官方插件管理页与自由安装入口保留，MCP resources 复用 0.2.0-rc.1 base 已有 row。
scripts/build.mjs: 内联产品模块但 externalize 官方 Cordis/credentials/LLM/MCP client/resources、MCP SDK v2、tools/settings/Schemastery 与 Client ui-primitives 单例的双端构建器。
src/index.ts: Web/Desktop 共用 Host 组合入口，绑定 credentials/pi-ai/官方 pluginManager、插件 inventory 上报、整包卸载重启与 mcp-runtime；企业插件安装/更新/卸载由 Client 官方 Remote 执行，MCP 仍属于唯一 owndsh-plugin，不新增 Loader row。
src/mcp-runtime.ts: 本地 MCP 路由与官方 client 子 fiber 组合器，按可信身份、公共快照、连接意愿、凭据与用户本地 exposure 偏好调和；提供 connect/pause/reconnect/disconnect 与 MCP_AUTH_REQUIRED 状态；活动触发 60 秒租约验证，平台失效先关门禁，再释放连接；API Key 认证值原样放入指定 Header 并合并公共固定 headers，OAuth 固定使用本机 loopback callback。
src/mcp-tools.ts: 官方注册表的有界目录与连接代次；复用 Pi vendored 的英文 schema 文档与 BM25，按四档 exposure 计算 direct/deferred/codemode/hidden 的 native/PTC 投影；统一 tool_search 管理每个 Agent 的下一轮选择，本步 presented 快照负责执行门禁，实时撤权优先，控制工具名称冲突拒绝。
src/mcp-pi-search.ts: Pi MIT 纯逻辑 vendoring（基线 `3dd803d`）；提供英文 tokenizer、schema 文档构造、BM25 排名与 OwnDsh 四档运行时 exposure 解析，接受 Pi 五档输入并隔离 Pi Agent 的 active set/loadout 与运行时。
src/mcp-oauth.ts: 官方 MCP SDK v2 `OAuthClientProvider` 的宿主接缝；以确定性摘要隔离 grant，持久化官方 client information/tokens，短生命周期保存 SDK discovery/verifier 以绑定授权回调，并交接系统浏览器与 loopback callback，不实现 OAuth 协议。
tests/mcp-oauth.spec.ts: 身份/目标绑定、官方 StoredOAuth* 记录、discovery/issuer/iss 绑定、官方 SDK OAuth 委托与取消生命周期；不复制 OAuth 协议测试。
tests/mcp-runtime.spec.ts: 真实 Cordis/tools/system-prompt 与受控 PTC binding 验证 direct/codemode/deferred/hidden、tool_search、下一轮 assembly、Agent 隔离和执行守卫；OAuth/transport 由独立官方 client 测试覆盖。
tests/mcp-pi-search.spec.ts: Pi vendored 英文 tokenizer、schema 字段检索、BM25 排名与 exposure 覆写解析的最小纯逻辑回归。
tests/bundle.spec.ts: 安装配置、credentials/模型/分发组合、V1 Session 停用、兼容 peers、Client graph 与构建产物验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
