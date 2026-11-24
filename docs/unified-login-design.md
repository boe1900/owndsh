# OwnDsh 统一登录与客户端授权

> 状态：设计冻结，2026-11-09；2026-11-10 修订新鲜登录后的授权交互；2026-11-24 为 Android 增加固定原生回调边界，真机验收另列。取代 MVP §6.3–6.4 与 P2-08C 关于两套登录页面及客户端不复用浏览器身份的决策；旧验收作为历史证据保留。

[INPUT]: 固定 public clients、Sa-Token 浏览器会话、Host PKCE/Refresh Grant、设备归属与桌面/Android 原生回调边界。
[OUTPUT]: 唯一网页登录入口、浏览器身份复用、一次性客户端授权、桌面 loopback 与固定 Android callback 的实施契约。
[POS]: 认证体验的实施真源；管理权限归 RBAC，客户端授权归 PKCE。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

## 1. 身份与会话

采用 RFC 8252 / RFC 7636 的系统浏览器、Authorization Code 和 S256 PKCE。桌面等现有客户端保留随机端口 IPv4 loopback；Android 企业登录额外允许唯一固定私有 scheme 回调 `com.owndsh.mobile://oauth/callback`，使浏览器先唤醒应用再完成 Host 交换。只有 `/login` 一套 React 凭据界面，LOCAL/LDAP/OIDC、验证码和首次改密共用现有状态机。后端静态登录表单退役，历史 URL 仅重定向。

浏览器沿用 `enterprise-admin` public client 和现有 HttpOnly、host-only Cookie；该历史协议名称不表示管理角色，employee 同样能认证。公开认证账号查询不依赖控制台 bootstrap，管理页面和 API 的 RBAC 保持独立。

浏览器保持 12 小时绝对有效期；客户端保持 12 小时 Access、30 天绝对有效期单次轮换 Refresh Grant。不引入另一套身份数据库或通用 OAuth 平台。

## 2. 唯一旅程

1. Host 生成 state/verifier，建立回调后打开既有 `/enterprise/auth/v1/authorize`。原有端侧监听 `127.0.0.1` 随机端口；Android 企业登录使用固定原生回调，由 Node 保有待完成事务与 PKCE proof。
2. Server 校验 client/redirect/S256/installation，创建 5 分钟 Harness 授权事务，跳转公开 `/authorize?transaction_id=…`。Android 仍使用 `dsh-desktop`，不新增 clientId。
3. 授权页读取事务和浏览器会话。未登录进入 `/login?redirect=/authorize…`；登录页运行独立的浏览器 PKCE 事务，既有 `/browser-session` 只写 Cookie。本次新鲜认证完成后，由共享 PKCE 完成器直接批准其保存的原桌面事务，无需第二次点击；LOCAL、首次改密、LDAP 与 OIDC 使用同一完成器。
4. 浏览器已有会话时展示真实账号和“以 {username} 继续”，点击后批准原桌面事务；切换账号后重新认证成功也直接续授。不向 Host 复制浏览器 Token。
5. 原 loopback callback 向 Host 交付 code/state；Android callback 先唤醒 Activity，再通过应用私有 IPC 交付同代、未过期事务。Host 校验后以自己的 verifier 交换客户端凭据，继续登记设备与 bootstrap。
6. loopback 路径重定向 `/authorized` 品牌页，显示“网页授权已完成，应用正在完成登录”，尝试无参数 `owndsh://open`，保留手动打开按钮。Android 固定 callback 直接回到应用，不依赖该完成页。是否就绪仍以 Host READY 为准。

取消原子消费事务，回调 `error=access_denied&state=…`；新 Host 映射已取消。刷新不自动重复确认。超时、网络错误不显示客户端已登录。

## 3. 协议与安全

- `GET /enterprise/auth/v1/session`：有效浏览器 client 与启用成员，返回 id/username/displayName；未登录 401。不要求管理权限。认证响应 `Cache-Control: no-store`。
- `POST /enterprise/auth/v1/authorization`：JSON transactionId/csrfToken/userId/approved；要求浏览器会话、同源、启用成员、展示账号一致、正确事务类型与 CSRF；原子消费后返回批准或拒绝的唯一 redirectUri。不能复用身份绑定事务。
- 两个 PKCE verifier 分别留在浏览器和 Host；桌面 code 不得用于 `/browser-session`，浏览器 code 不得用于桌面 `/token`。
- 新鲜认证后的自动续授只在当前标签的一次性 state/verifier 校验及 Cookie 交换成功后执行，原事务取自该次 PKCE 保存的同源 returnTo，重新读取服务端账号和事务 CSRF 后走同一批准接口。现有会话跳转、刷新授权页或 URL 参数均不能触发自动续授；不增加“最近登录”标记或自动批准 query 开关。
- 已有会话授权使用独立白名单审计 metadata，不伪造新鲜 LOCAL/LDAP/OIDC 认证，不重复 JIT 或组同步。
- 身份绑定保留指定源的新鲜认证，复用 React 表单但不能跳过凭据；首次改密完成前不建立浏览器会话。
- 继续检查账号启停、设备 owner/ACTIVE。同一 installation 不静默转移 owner，换账号可能返回既有设备归属错误。
- HTTPS 保留 `__Host-`、Secure、SameSite=Strict。跨站首跳后通过同源 API 读取 Cookie；HTTP 自托管遵循既有约定。
- `owndsh://open` 保留为不携带 code/state/Token/Server 地址的普通窗口唤回。Android 企业授权仅接受固定 `com.owndsh.mobile://oauth/callback`，请求 authorize 时逐字匹配完整 URI，不接受 query、fragment、userinfo、port、大小写或路径变体。
- Console 的共享批准入口对原生回调只放行单个 `code,state` 或 `error,state`；code/state 非空，error 仅允许 `access_denied`，拒绝未知/重复参数及 fragment。新鲜登录和已有身份确认共用此边界。
- code 兑换保留现有 URI 比较语义绑定 redirectUri/client/installation/S256，先原子消费 code 后校验，不新增绕过或回环替代兑换。Node 继续持有 verifier 和令牌；Activity 不将回调导航进 WebView，不记录凭据，不从失效 Intent 恢复登录。
- 私有 scheme 不能证明唯一接收应用；PKCE 防止被截获的 code 被其他应用兑换，但不能阻止恶意接收造成登录失败。此方案不是经域名校验的 HTTPS App Link。

## 4. 退出范围

| 操作 | 浏览器 | 当前客户端 | 其他客户端 |
|---|---|---|---|
| 客户端退出 | 保留 | 撤销 installation Refresh Grant、清本地凭据 | 保留 |
| 网页退出 / 授权页切换账号 | 撤销并清 Cookie | 保留 | 保留 |
| 改密、停用、管理员撤销 | 按现有用户/设备范围撤销 | 按现有范围撤销 | 按现有范围撤销 |

切换浏览器账号不等于允许设备转移；不删除 profile 或本地工作数据。

## 5. 兼容与原生唤回

- 保留 authorize 参数、`/token`、client_id、现有 callback URI、凭据格式与存量会话；只给 Harness 增加一个固定 Android callback。旧插件能使用新网页，保留旧回调文本；历史登录没有 Cookie 时需首次网页登录。
- 原有 OwnDsh loopback callback 选择品牌完成页；MCP 共用 loopback 原语不注入 OwnDsh 跳转。iOS 与桌面保持既有路径，本轮 Android 适配不改 MCP。
- Android 只替换企业登录 callback factory，保留锁定插件的业务、PKCE 和 token 流程；移动宿主注册固定 Intent 并以 generation、state、截止时间和一次性交付约束私有 IPC。必须 Server、Console 与 APK 配套，不能仅升级 APK 后宣称回调已接通。
- 桌面沿用官方 Electron 协议注册与窗口聚焦，现有品牌补丁将 `dsh://open` 映射为 `owndsh://open`；macOS/Windows 安装注册由官方打包链路负责。不增加认证逻辑、第二套协议处理器或任意命令 IPC。
- 插件发布和桌面 npm 精确锁升级分别交付。源码完成不能宣称已发布；macOS/Windows 实包验收状态单列。

## 6. 改动地图

auth/application 增加浏览器会话批准/拒绝和审计；auth/web 提供公开账号摘要、授权与统一入口；contracts 增加 operation/schema 并派生；console 增加 `/authorize`、`/authorized` 并统一身份绑定表单；platform-client 支持专属完成页与取消；desktop 复用现有官方 scheme 品牌映射。Android 扩展只触及 PlatformClient 精确 allowlist、Console 共享回调检查和独立移动仓库的企业 callback 适配，无新接口或数据库迁移。同步 L1/L2/L3 和历史设计入口。

## 7. 验收

- LOCAL/LDAP/OIDC、首次改密、新鲜身份绑定保留；仅一套凭据页。
- 未登录经新鲜网页登录直接批准原桌面事务；已有会话需账号确认；employee 可授权，管理 API 仍拒绝。
- 批准/拒绝仅消费一次；跨源、CSRF、错误 client、身份绑定借道、过期和重放被拒绝。
- 客户端退出保留浏览器身份；浏览器退出保留客户端 Grant；设备撤销/owner 冲突不可绕过。
- code/verifier 不混用；取消正确归类；MCP 不跳转；页面不提前宣称 READY。
- 原生 scheme 构建配置有自动验证，处理器只接受固定链接；macOS/Windows 实包唤回分别记录。
- Android 需在 OPPO/Edge 真机经公网完成新鲜密码与已有身份各至少两次，允许浏览器期间进程冻结但回调须唤回原引擎并达到 READY；另测后台 UI 重建、取消、过期和无活动事务拒绝。下方历史桌面/浏览器记录不代表该真机门禁已通过。

## 8. 实施记录

2026-11-09 已完成 Server、Console、contracts、插件与独立 desktop 源码实施；未发布、未部署，无数据库迁移或 profile 清理。

- Java 21 / Maven（显式覆盖仓库默认跳过测试）：BrowserAuthorizationController 2、LegacyLoginController 1、PlatformAuthorizationSecurity 13、T05ApiContract 8、OwnDshPlatformSessionGateway 7、EnterpriseContractSchema 1，共 32 项通过；安全状态测试使用真实 Redis，协议 fixture 由 Java JSON Schema 校验。
- Console：授权/登录/角色矩阵/PKCE 相关 57 项 Vitest 通过，TypeScript 与 Vite production build 通过。
- 插件：PKCE 与 platform-service 26 项 Vitest 通过，contracts 11 项通过；生成漂移检查及 contracts/platform-client TypeScript 通过。新增浏览器账号、授权请求/结果 fixture 同时由 Java 与 Zod 验证。
- Chromium 浏览器检查：以模拟 Server 认证响应驱动生产构建，验证首次登录恢复原桌面事务、已有浏览器身份直达账号确认、展示 userId 绑定、真实插件 loopback 303 到无凭据完成页、employee 不请求 admin bootstrap，以及桌面/390px 布局；未发生页面 JavaScript 异常。截图位于 `/tmp/owndsh-unified-login-qa/`，脚本位于 `/tmp/owndsh-unified-login-qa.cjs`。
- 浏览器检查发现 Vite `/auth` 前缀吞掉 `/authorize` 与 `/authorized`；改为只代理 `/auth/code` 精确路径，与部署 nginx 一致。
- 旧本地 Pake Desktop 基线历史检查：prepare-only、Info.plist 语法、WebKit 兼容测试 1 项及 macOS x86_64 `cargo check --locked` 全部通过；提交前发现远端已迁到官方 Electron，此实现不再进入当前桌面代码，现行接入见下文。

提交前已同步 `owndsh-desktop/main@42dcabb`：当前锁定官方 Harness `dsh-v0.2.1-rc.5`、预置 npm 插件 `0.1.0-beta.20`。核对现有 `patches/branding.mjs` 已完成协议注册和固定 `owndsh://open` 窗口聚焦映射，无需重复修改桌面代码。旧 Pake 实现仅在本地 `codex/legacy-login-activation-snapshot@8cf0b24` 保留，不推送、不恢复到 Electron 主线。当前插件新增的完成页交接仍需发布后更新桌面精确版本锁，不能把旧 Pake 构建检查作为 Electron 实包证据。

验证边界：LOCAL 的真实浏览器联调见下节，LDAP/OIDC 完整提供方链路尚未重跑，已有身份 adapter/密码状态机保留。尚未执行 macOS/Windows 新安装包的系统级协议唤回验收。desktop runtime 仍锁定既有 npm 插件；需发布本次插件并升级该精确锁后，发行包才包含品牌完成页交接。客户端退出后的同账号复用已有自动验证，另一账号登录仍遵守既有 installation owner 约束。

### 2026-11-10 本地真实联调

当前 Server JAR 与 Console production build 在独立 Compose 项目 `owndsh-login-local` 运行，入口 `http://127.0.0.1:62227`；独立 PostgreSQL/Redis 从空库完成 Flyway 初始化。仅在本机 override 中使用本机架构的缓存镜像、挂载当前产物，并将测试 Server 镜像的健康检查适配为其已有 curl；生产 Compose 未修改。

插件经 `pack:bundle` 打包，临时包 manifest 标记为 `0.1.0-beta.20-unified-login.20261110`，通过官方 CLI 安装到隔离 profile，实际运行 npm Harness `0.2.1-rc.5`。安装包中的 Host bundle SHA-256 与当前构建一致：`718b40f3f607bef2fc7c94d9b94ba053d63f4ec8e3b849d6c537da453f504c7d`。未修改仓库插件版本或发布 npm，未升级日常桌面 profile。

`.audit/unified-login-local-e2e.mjs` 使用真实 Chromium、LOCAL 身份源及 Host PKCE/loopback；只将系统打开 URL 的动作交给测试浏览器，未模拟认证接口。验证码答案从隔离 Redis 读取，用于验证完整表单链路。优化后 9 项断言通过：管理员登录、真实 API 创建 employee、员工验证码/首次改密后无需二次确认直达 Host READY、管理 API 返回 403、客户端退出保留网页会话且需账号确认但无密码请求、网页退出后 Host 仍可向服务端刷新 bootstrap、再次新鲜登录无需二次确认、拒绝授权映射 CANCELLED、取消后复用浏览器会话重登。

本次交互修订只修改 Console：共享 PKCE 完成器续授其保存的原事务，账号确认页与自动续授共用批准及回调校验，按钮改为“以 {username} 继续”。Console PKCE/授权/角色相关 65 项测试及 production build/TypeScript 通过，覆盖交换失败或 state 错误不续授、重放拒绝、事务替换拒绝、非法 loopback 拒绝和 URL 参数不能跳过已有会话确认；LOCAL/LDAP/OIDC 在实现上共用完成器，本轮真实提供方验证仍仅为 LOCAL。原插件包及本地 Server 可直接承接，无需新增接口或修改凭据格式。

结果见 `.audit/unified-login-local-evidence.json`；本机截图在 `.tmp/unified-login-local/evidence/`，覆盖账号确认、无凭据完成页、Host 门禁解除及 390px 完成页。服务保留运行，自动化 Host 已停止。网页退出后的验证使用现有 Access Token 刷新 bootstrap，未将它作为 Refresh Grant 轮换证据；系统级 scheme 唤回、LDAP/OIDC 与模型聊天不在本轮范围。

### 2026-11-24 Android 固定回调源码门禁

Server 只给既有 Harness client 增加固定 URI；Console 在新鲜登录与已有身份批准/拒绝共用的边界增加对应校验。原有桌面 loopback、管理端回调和 token exchange 实现保持既有行为，无新 API、协议 schema 或数据库迁移。

Java 21 门禁显式设置 `maven.test.skip=false`，使用真实 Redis 8：PlatformClientTest 2 项、PlatformAuthorizationSecurityTest 14 项全部通过且无跳过。Console 聚焦 PKCE/授权 45 项、TypeScript 与完整 production build 通过；本机 Node 24.13.0 低于声明的 24.15.0 下限并产生 engine 警告，该环境事实不扩大运行时兼容承诺。

2026-11-24 已将本轮 Server/Console 部署到 NAS，部署前保留配置与旧镜像记录。完整 resolved Compose 比较确认仅替换两项应用 image；数据库、Redis、公开 Origin、密码、验证码及 Tunnel 配置未改。两个应用均健康，公网 `/healthz` 与 `/login` 返回200，固定 Android authorize 返回303，尾斜线变体返回400，原 loopback 返回303。无需数据库迁移。

配套移动候选 `0.1.0-dev.6.4` 在 OPPO Find X6 / Android15 / Edge155.0.4283.48 上，经公网完成新鲜密码与已有身份确认各两轮 `READY`；其中一轮在浏览器前台终结 UI 后，新 Activity 仍接回原引擎。返回后 started/foreground 资格释放，无活动事务回调被忽略。测试未连接浏览器调试器，也未通过 HTTP 探测维持后台执行。另一次原生回调已唤回冻结引擎，但后续公网请求超时，不能归为完整登录通过或宣称公网稳定。移动端实现、取消/期限边界与设备证据由独立移动仓库的 `lifecycle-design.md` 记录；本轮不扩大到 iOS、其他厂商或身份提供方。
