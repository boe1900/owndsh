# bundle/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: npm 员工用户入口，说明 `latest` 安装、Server 登录、默认免公钥安装、可选验签、更新卸载与兼容基线。
package.json: npm 发布清单与 `dsh.bundle`/`dsh.client` 双入口，官方 Harness 依赖声明 `^0.1.5-rc.2` peer 范围；显式 peer/dev 依赖 MCP SDK 1.30.0 用于 OAuth discovery；Client 只声明设置/门禁两个所用 slot 的所有者，避免依赖新版已退役的 client-runtime row。
screenshots.json: 社区市场从插件源码目录读取的四张原始截图清单，通过 GitHub 固定提交 URL 复用 docs/assets 媒体并控制展示顺序，不改变 npm 运行包。
tsconfig.json: bundle Host 公开声明的 emit-only TypeScript 边界，通过 workspace 声明消费产品模块，并局部跳过链接上游损坏声明检查。
cordis.patch.yml: 官方 profile layer，覆盖企业 default、停用个人 provider/模型设置并插入企业 Host/Client row。
scripts/build.mjs: 内联产品模块但 externalize 官方 Cordis/credentials/LLM/MCP client/tools/settings/Schemastery、MCP SDK 与 Client ui-primitives 单例的双端构建器。
src/index.ts: Web/Desktop 共用 Host 组合入口，绑定 credentials/pi-ai/受管插件与 mcp-runtime；MCP 仍属于唯一 owndsh-plugin，不新增 Loader row。
src/mcp-runtime.ts: 本地 MCP 路由与官方 client 子 fiber 组合器，按可信身份、公共快照、连接意愿和凭据调和；提供 connect/pause/reconnect/disconnect 与 MCP_AUTH_REQUIRED 状态；活动触发 60 秒租约验证，平台失效先关门禁，再释放连接；API Key 认证值原样放入指定 Header 并合并公共固定 headers，OAuth 固定使用本机 loopback callback。
src/mcp-tools.ts: 读取官方公开注册表，按连接代次与结构等价维护有界目录；为每 Agent 搜索/热集合、native/PTC SDK 投影及单调执行 guard 共用同一事实来源，状态只导出名称/简介供端侧浏览且不改变会话热集合，失效搜索/调用给出重新授权指引。
src/mcp-oauth.ts: 从 bootstrap 身份与公共目标摘要隔离 MCP grant；access token 仅内存，refresh/API Key 与动态 public clientId 走官方原子记录，复用 PKCE loopback/DCR 并区分失效授权与瞬时刷新失败，并阻断取消/销毁后的迟到写入。
tests/mcp-oauth.spec.ts: 身份/目标绑定、严格记录、仅内存 access token、rotation/invalid_grant 与取消提交回退；SDK PRM/AS discovery 的 mismatch/redirect/成功 fixture；真实 loopback 校验 PKCE/state，浏览器与 token 响应受控。
tests/mcp-runtime.spec.ts: 真实 Cordis/tools/pi-ai 与本地 HTTP MCP/模型服务验证五种模式/语言组合的请求正文、会话隔离、搜索/预算、工具简介与计数一致且查看不加载、目录变更、代次撤销、同名 remount、凭据目标/账号隔离、固定 Header 与完整/裸认证值实际出站、token 延期和 refresh/pause/reconnect/disconnect/换账号/dispose 竞争；search/full 均覆盖真实 loopback 重新授权、同一 Agent 失效/恢复及提前 401 不重放；PTC 解释器采用受控 bindings 替身。
tests/bundle.spec.ts: 验签开关默认值与显式开启、credentials/模型/分发组合、V1 Session 停用、兼容 peers、Client graph 与构建产物验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
