# bundle/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: npm 员工用户入口，说明 `next` 安装、Server 登录、官方 Discover 自定义索引与兼容基线。
package.json: npm 发布清单与 `dsh.bundle`/`dsh.client` 双入口，官方 Harness 依赖锁定 `0.2.1-rc.5`，Client 只注入设置页、布局和官方 Remote 所需服务，不创建未绑定 workspace 的技能会话；MCP OAuth/transport 使用官方 `@modelcontextprotocol/client` 2.2，检索使用 Pi vendored 英文 BM25 纯逻辑。
screenshots.json: 社区市场从插件源码目录读取的四张原始截图清单，通过 GitHub 固定提交 URL 复用 docs/assets 媒体并控制展示顺序，不改变 npm 运行包。
tsconfig.json: bundle Host 公开声明的 emit-only TypeScript 边界，通过 workspace 声明消费产品模块，并局部跳过链接上游损坏声明检查。
cordis.patch.yml: 官方 profile layer，覆盖企业 default、停用 API Key/个人账号 provider 与模型设置并插入 OwnDsh，同时启用 DSH 官方 plugin-market 与 Discover 页面；备用市场行使用独立 entry id，官方可选 bundle 同时存在时按模块身份禁用备用行，避免 Settings 重复配置；MCP resources 复用 0.2.1-rc.5 base 已有 row。
scripts/build.mjs: 内联产品模块但 externalize 官方 Cordis/credentials/LLM/MCP client/resources、MCP SDK v2、tools/settings/Schemastery 与 Client ui-primitives 单例的双端构建器。
src/index.ts: Web/Desktop 共用 Host 组合入口，绑定 credentials/pi-ai/官方 pluginManager/pluginMarket、插件 inventory 上报、隔离 skill provider、整包卸载重启与 mcp-runtime；通过 loopback 代理以内存 Bearer 读取受保护的 Server 索引并维护 DSH 官方索引源，MCP 与 OwnDsh skill 仍属于唯一 owndsh-plugin，不新增 Loader row。
src/skill-provider.ts: 复用官方 dsh-skill/dsh-skill-filesystem，将 `customSkillDirs` 固定到 `$DSH_HOME/enterprise/skills/` 并关闭默认 root；只增加设备 manifest 的 disabled 过滤和重注册失效接缝，不复制 parser、rank 或 watcher。
src/mcp-runtime.ts: 本地 MCP 路由与官方 client 子 fiber 组合器，按回环同源请求、严格公共快照、连接意愿、凭据与用户本地 exposure 偏好调和；提供 connect/pause/reconnect/disconnect 与 MCP_AUTH_REQUIRED 状态；活动触发 60 秒租约验证，平台失效先关门禁，再释放连接；API Key 认证值原样放入指定 Header 并合并公共固定 headers，OAuth 使用 issuer/endpoint 约束、本机 loopback callback 与有界重连 supervisor。
src/mcp-tools.ts: 官方注册表的有界目录与连接代次；复用 Pi vendored 的英文 schema 文档与 BM25，按四档 exposure 计算 direct/deferred/codemode/hidden 的 native/PTC 投影；统一 tool_search 管理每个 Agent 的下一轮选择，本步 presented 快照负责执行门禁，传输掉线可暂时撤下并恢复呈现，实时撤权优先，控制工具名称冲突拒绝。
src/mcp-pi-search.ts: Pi MIT 纯逻辑 vendoring（基线 `3dd803d`）；提供英文 tokenizer、schema 文档构造、BM25 排名与 OwnDsh 四档运行时 exposure 解析，接受 Pi 五档输入并隔离 Pi Agent 的 active set/loadout 与运行时。
src/mcp-oauth.ts: 官方 MCP SDK v2 `OAuthClientProvider` 的宿主接缝；以确定性摘要隔离 grant，持久化官方 client information/tokens，短生命周期保存 SDK discovery/verifier 以绑定授权回调，并交接系统浏览器与 loopback callback，不实现 OAuth 协议。
src/remote/: 本人设备的安全 DSH workspace 链路，显式 Host 开关、持久身份、完整 Noise IK、租约、字节信用和原生 HTTP/WS carrier；API Peer cookie 留在远端 Host，不复制 Gateway codec。
tests/remote-carrier.spec.ts: 真实 HTTP 大体积二进制流、mux Unicode 跨片重组、信用背压、取消与在途响应/错误交错及 realpath 路径约束。
tests/remote-native-carrier.spec.ts: 真实 HTTP/WS 的原生 API cookie 隔离、独立 Peer 共用、远端插件目录只读与管理拒绝、端点准入、连续取消超过流上限及迟到帧丢弃、关闭释放。
tests/remote-network-boundary.spec.ts: 真实 Upgrade 的平台 Origin/Bearer 隔离，以及文件 RPC envelope、方法/路径一致性与准入前拒绝。
tests/remote-secure-link.spec.ts: 双端真实 Noise 与进程内控制面路由，验证握手/租约门禁、密文传输、撤权、过期和旧 socket 隔离。
tests/remote-key.spec.ts: 官方 credentials 契约下的 Host 静态密钥重启复用、owner 维度隔离与损坏记录拒绝。
tests/remote-workspace-runtime.spec.ts: 产品 Host 默认关闭、显式开启、再开启复用身份、平台撤销清理、设备目录分页/循环拒绝，以及 error/connect.reject 占用原因保留与 socket 释放。
tests/remote-view-registry.spec.ts: 重连先释放旧链路、失败保留目标可重试，成功后新 view URL 隔离且设备存储 authority 稳定；真实 HTTP 验证创建/重连占用只返回固定 409，未知故障仍脱敏为 503。
tests/remote-runtime.spec.ts: 旧 presence 兼容类的登录与撤权生命周期回归。
tests/mcp-oauth.spec.ts: 身份/目标绑定、官方 StoredOAuth* 记录、discovery/issuer/iss 绑定、官方 SDK OAuth 委托与取消生命周期；不复制 OAuth 协议测试。
tests/mcp-runtime.spec.ts: 真实 Cordis/tools/system-prompt 与受控 PTC binding 验证 direct/codemode/deferred/hidden、tool_search、下一轮 assembly、Agent 隔离和执行守卫；OAuth/transport 由独立官方 client 测试覆盖。
tests/mcp-pi-search.spec.ts: Pi vendored 英文 tokenizer、schema 字段检索、BM25 排名与 exposure 覆写解析的最小纯逻辑回归。
tests/bundle.spec.ts: 安装配置、credentials/模型/分发组合、V1 Session 停用、兼容 peers、Client 三个 slot 的共享入口、graph 与构建产物验收。
tests/skill-provider.spec.ts: OwnDsh skill provider 的根目录隔离、与官方 preset filesystem provider 共存、官方 provider 投影和本地变更读取回归。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
