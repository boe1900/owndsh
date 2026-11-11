<!--
[INPUT]: OwnDsh 员工登录/设备归属与 Remote v1、官方 Harness 0.2.1-rc.5 的原生 UI 和 owner API Peer、ds-harness-remote 4ec80b1。
[OUTPUT]: 提供 R1–R5 后首个 DSH 实际业务的页面、授权、加密 carrier、原生 Host 与验收契约。
[POS]: 插件控制插件的实施规格；基础连接与后续独立 Web/Android 方案分别留在原有文档。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# DSH 远程工作区实施设计

2026-11-11。插件端首个 DSH 远程工作区已实现，按下文范围验收。只支持 DSH 原生工作区，不建立 Codex、ACP 或多后端 adapter。首次实施基线为 main `82e7ac311`，NAS 双机验收使用 `663c43e`。DSH 使用已锁定的 npm `0.2.1-rc.5`；依赖升级另按兼容性检查表验证。

## 1. 页面和权限

员工在本机账号菜单打开“远程工作区”，选择本人另一台设备，进入该机器独立的完整 DSH 页面。原生工作区目录、会话、文件和终端都属于远端，不与本机混排。页面持续显示设备名，并提供“返回本机”。

允许访问本机是独立的持久化开关，默认关闭。登录有效并且开关开启时才发布可连接 Host；关闭立即终止入站连接，不影响本机作为 Controller 访问其它机器。退出登录、设备撤销和账号切换终止对应能力；DEVICE_REVOKED 不能被普通 SIGNED_OUT 覆盖。

连接检查未完成或失联时阻断交互，保留远端目标。手动重连成功后整页重新加载。任何失败都不能调用本机同名业务，不能自动重放 prompt、终端输入或 mutation。

## 2. 上游证据与实现选择

参考仓库为 `liguobao/ds-harness-remote@4ec80b1b1827d465a7bbc880d0be38db636580cc`。

| 上游位置 | 已核对行为 | OwnDsh 选择 |
|---|---|---|
| `packages/plugin/src/client.ts` 的 switchMode | 成功后 `window.location.reload()` | 整页进入固定设备 view。 |
| `client-runtime.ts` 的 setMode/selectRemoteTarget | connect、兼容检查，再切换并清理旧资源 | 建链完成后才返回 view URL。 |
| `client.ts` 的工作区选择 | baseline 就绪后 connectWorkspace/openSession | 使用官方 workspace/follow 与原生 UI。 |
| `client-runtime.ts` 的 handleRemoteClose/leaveRemote | 失联保留 remote，显式退出才切 local | 明确退出、断线禁止本地回退。 |
| `typert-gateway-switch.ts` | 改写 Host singleton invoke/stream 和私有 dispatch | 改用逐 document mount 与独立 Peer，避免全局切换影响本机页。 |

已比较两种设计并独立评审，选择逐页 mount。`.audit/remote-workspace-mount-evidence.json` 已证明官方 npm rc.5 原生 UI 能在独立 mount 启动，并完成基础 Storage 隔离；该同机证据不代表跨机业务或加密验收。

## 3. 所有权与链路

```text
本机浏览器 /enterprise/remote/views/<viewId>/
  → 本机插件固定 deviceId 的 ViewRegistry
  → Noise IK + lease + 有界加密 carrier
  → Java 信令与密文 Relay
  → 远端插件的固定 loopback Host carrier
  → /connect?interactions=answer 创建的独立 owner API Peer
  → 官方 DSH Workspace / Session / File / Terminal
```

Java 不解密或实现 Harness 业务。远端 API Cookie 只留远端插件内存，本机 OwnDsh Bearer 只留本机 Host。浏览器只能收到脱敏设备、view URL 和状态。

每个 view 对应独立 link 和远端 Peer，HTTP 与 mux 使用该 Peer。Server 当前对每个 Host 实施单 link 独占；刷新和重新连接先释放旧 link，再产生新 viewId/link，旧 URL 的请求不会改绑新 link。不同 Host 可同时打开，重复控制同一 Host 返回忙状态。关闭 link 不关闭共享 Host presence；mux 关闭释放该页 Peer。最多八个 view/建链任务，页面状态检查维持使用权，两分钟无访问回收。

## 4. API

服务端员工 API 复用 Bearer 和真实 installation，不要求管理员角色。

| API | 契约 |
|---|---|
| `GET /enterprise/api/v1/remote/devices` | tenant AND user 过滤，排除请求本机 installation；复用 RemoteDevice items/page。 |
| `POST /enterprise/api/v1/remote/devices/{id}/ticket` | owner、在线/开启、源身份、pin 与幂等检查；返回 `ticket/linkId/deviceId/expiresAt/iceServers/hostPublicKey`。 |

管理角色不授权任意员工远控，原管理 ticket 五字段 JSON 保持不变。Host 认证 hello 首次原子 pin 32 字节静态公钥，后续静默换钥拒绝。旧无公钥 hello 可保留 presence，但不能签发安全 ticket；ticket 同时核对数据库 pin 和当前 READY Host。

插件按服务端 cursor 读取完整本人目录，最多五页、500 台；超限、缺失或循环 cursor 返回错误，不把截断列表当作完整目录。

本机控制面前缀为 `/enterprise/api/v1/local/remote`，同时检查回环同源和官方 `connection.admit()` owner。写请求严格 JSON，最大 1 KiB，不接受代理 URL、任意 RPC、Cookie 或密钥。

| 方法/相对路径 | 请求 | `data` 返回 |
|---|---|---|
| `GET /status` | 无 | `{enabled}` |
| `POST /enabled` | `{enabled:boolean}` | `{enabled}` |
| `GET /devices` | 无 | `{items:RemoteDevice[]}` |
| `POST /views` | `{deviceId}` | `{url}` |
| `GET /views/{id}/state` | 无 | `{state:'connected'\|'disconnected'}` |
| `POST /views/{id}/reconnect` | 无 | 新 view `{url}` |
| `POST /views/{id}/close` | 无 | `{}` |

浏览器仅接受固定同源 `/enterprise/remote/views/<uuid>/` URL。返回本机不依赖 close 请求成功，安全回收仍受 lease、link 关闭和 view 回收约束。

## 5. 握手与加密

固定顺序为 `connect.request → connect.accept → transport.selected(relay) → handshake(counter=0) → handshake(counter=1) → lease.acquire → 双端 ACK → 业务`。越序帧拒绝；只有 active lease 才转发业务。续租重验源 installation、目标 owner、登录与当前 Host pin，并延长 Redis link 生命周期。

使用成熟的完整 `Noise_IK_25519_ChaChaPoly_SHA256` 双消息实现与独立公开标准向量，删除旧单消息自制 IK。prologue 为以下数组的 UTF-8 JSON，公钥均使用 canonical 无 padding base64url。

```json
["owndsh.remote.v1", "<linkId>", "<hostDeviceId>", "<controllerId>", "<hostPublicKey>", "<controllerPublicKey>"]
```

Host 静态密钥保存在官方 credentials，绑定平台、用户、installation 和 device；Controller 每 link 使用新密钥。方法、端点、关联 ID、HTTP 头和正文都在密文内。单 Relay 帧含 AEAD 不超过 65536 字节；大内容分片，信用窗口有界，nonce 串行分配，支持取消和背压。

本功能使用加密 Relay。WebRTC adapter、coturn Allocate 不等于真实 LAN/P2P/跨 NAT/TURN 回落已验证，界面不得宣称当前使用这些路径。

## 6. 原生 UI 与浏览器状态

远端 document 从本机读取官方 UI、assets 和插件 module assembly。preboot 注入固定设备元数据；OwnDsh Client 远端分支只挂状态条与断线阻断，不创建本机账号/技能 store、不注册本机账号/MCP/技能设置和登录门禁。

本机处理端点必须显式列举。静态资源包含 assets、plugins module/events、favicon 和 manifest；启动元数据为 settings/describe、credentials/describe、dynamic runner inspect manifest/inventory。open-in-app/apps 返回空，不执行本机 opener。其余 `/api/` 只进入固定远端 link，再由远端白名单准入；未知路径拒绝。

路径变化不能隔离同 origin 的 localStorage。Storage façade 必须先于官方模块执行，按平台/本机账号身份/远端 device+installation/协议生成稳定 authority。localStorage、sessionStorage 的方法、属性、枚举、length、clear 与 storage event 都隔离；不修改 Storage.prototype，不清空整个 origin。随机 viewId 不参与 namespace，同一远端刷新保留草稿。

此机制防止官方状态误混，同源插件之间仍无浏览器安全沙箱。元数据通过 JSON 编码并转义 `<`，设备名称不能拼成可执行 HTML。

## 7. Host 能力边界

远端官方 workspace/follow baseline 提供已有 DSH 工作区。会话、模型、工具审批、流和终端复用官方 Gateway。端点白名单必须核对锁定 npm rc.5 的真实声明，不能猜方法名。工作区创建、任意目录选择、上传、文件覆盖和删除暂不开放。

文件读取和预览基于可信 workspace catalog 做 realpath 包含检查，拒绝越界绝对路径、穿越和 symlink 逃逸。直接路径保留 symlink 与 `..` 的物理解析顺序；`readBytes` 的 baseFile 先取得真实路径，再按官方语义解析相对目标，避免检查文件与实际读取文件不同。插件安装、凭据秘密、桌面 opener、本机 OwnDsh API、dynamic runner 执行管理均拒绝。

Agent、工具和终端仍拥有远端 OS 用户权限，文件包含检查不是 OS sandbox。工具审批绑定独立 answer Peer，关闭 link 中止在途流并释放 Peer，不能留下脱离 lease 的控制通道。

## 8. 验收

使用隔离 Java Server、两个临时 npm rc.5 Harness 和测试员工账号，不操作用户正式 profile，不以手写假 Host 冒充真实 Harness。

1. 默认关闭、显式开启、本人发现与跨账号/tenant 拒绝。
2. 远端 workspace baseline、既有会话与新 prompt 归属正确，本机无业务副作用。
3. 完整 Noise/lease、超过 64 KiB 双向字节保真、取消、文件读取/越界拒绝与终端输入输出。
4. 同 ID 草稿、布局、终端不串；Storage event、属性枚举、clear、reload 和多远端分别验证。
5. Relay 掉线、关闭共享、登出和源/目标撤销均阻断；迟到响应不跨 view/账号/link 执行。
6. 多页/刷新/手动重连与原有登录、模型、MCP/技能、插件市场和最新账号 launcher 回归。
7. 独立代码审阅完成，验收报告明确区分通过、失败与未验证。

### 8.1 实际验收范围

可重跑业务入口为 [remote-workspace-local-e2e.mjs](../.audit/remote-workspace-local-e2e.mjs)，结果和实际包哈希保存在 [remote-workspace-local-evidence.json](../.audit/remote-workspace-local-evidence.json)。环境使用隔离 Java 21、PostgreSQL、Redis、两个 npm rc.5 Harness 和真实 Chrome。员工由真实管理 API 创建，分别完成 PKCE；没有替换用户日常 profile 或 NAS 服务。

| 证据 | 已验证行为 |
|---|---|
| 双 Harness 业务验收 | 默认关闭、明确确认开启、本人设备选择、完整加密 Relay、独立原生页面。 |
| 原生 Session | 远端创建/重命名、本人目录隔离、原生会话页面与 prompt 流式显示。模型使用明确标记的本地 OpenAI 协议夹具，仍经过真实 Java 模型网关。 |
| File / Terminal | 文件 RPC、multipart 大响应、媒体内容哈希、越界/symlink 拒绝，覆盖 symlink 与 `..` 组合以及 baseFile alias；真实 PTY attach/输入/ack/输出，文件副作用只发生在远端目录。 |
| 页面生命周期 | 刷新产生新 view、旧 URL 拒绝、草稿保留；断线阻断有效 mutation，断线刷新仍有返回入口，失败重连可再试，恢复后无操作重放。 |
| Chrome Storage 独立六项 | 本机与两个远端同名键、方法/属性/枚举/删除、跨页逻辑事件、clear、刷新持久化及恶意设备名转义；见 [存储证据](../.audit/remote-workspace-storage-evidence.json)。 |
| 自动回归 | 插件 193 项、workspace 边界 4 项、Console 122 项、Java Remote 40 项通过。Java 集成测试通过 Colima Docker socket 运行真实 PostgreSQL/Redis。 |
| 最终复验 | 最终打包后双 Harness 14 项全部通过；路径修复后 bundle 56 项与 typecheck 通过。独立增量审阅另运行 11 项定向测试，确认旧路径问题已关闭，无遗留中高优先问题。 |

当前没有宣称独立 Android/Web 管控台产品、生产 TLS、实际 P2P/TURN 回落、多节点 fencing 或外部真实模型供应商已验证。工具审批沿用原生独立 answer Peer 与事件/响应通道，审批弹窗尚未单独做真实端到端验收。原生 Electron 外壳行为也不由本轮 Web 验收推导。

### 8.2 NAS 双物理机验收

2026-11-11 将 `home-nas` 的 Server 与 Console 更新到 CI ARM64 镜像 `sha-663c43e`，两容器健康，保留既有 PostgreSQL、Redis、coturn 和数据卷。更新前备份 Compose、原镜像信息和完整数据库。实际镜像 ID、revision、备份清单与 Node 官方包校验值见 [部署快照](../.audit/remote-workspace-nas-deployment.json)。

Mac 使用隔离 npm rc.5 Controller，NAS 使用官方同版本 Harness 和本轮插件。NAS 的 `owndsh-dsh-web` 容器持久保存独立 profile 与 `/data/workspace` 测试工作区，以具有真实 Linux 账号记录的非 root 用户运行，重启策略为 `unless-stopped`。调试镜像复用 NAS 已有 glibc 镜像，不启动 Java 服务；Node 与 Harness 挂载独立运行目录，宿主不安装 Node。裸数字 UID 缺少 passwd 记录会使官方终端的 `os.userInfo()` 失败，[运行镜像](../.audit/remote-workspace-nas-runtime.Dockerfile) 编码该环境要求。

服务入口为 `http://home-nas:18080`。实际 HTTP/WS 产品链路直接连接 NAS，承载完整 Noise IK、lease 与加密 Relay。SSH 仅转发 NAS 回环 Web `18121` 和首次 PKCE callback，不承载产品远控数据。Mac 的测试浏览器显式将 `home-nas` 解析到系统返回的 IPv4，避免本机代理提供的 fake IPv6；不修改系统 DNS 或产品 origin。

[跨机证据](../.audit/remote-workspace-nas-evidence.json) 记录 14 项全部通过。覆盖员工双端 PKCE、Host 默认关闭及显式确认开启、本人设备发现、独立原生工作区、远端 Session 创建/重命名、模型流、文件和超过 64 KiB 的响应、媒体哈希、路径逃逸拒绝，以及终端输入/输出。终端生成文件经 SSH 从 NAS 实际文件系统复核，Mac 不存在同名文件。刷新淘汰旧 view，关闭 Host 后阻断业务且不回落本机，断线刷新、失败重试、手动恢复和返回本机也通过。关闭 Host 是受控断连测试，不代表物理断网或 UDP 阻断验证。

共用验收器的 NAS 模式如下。临时配置、测试账号和带访问凭据的启动 URL 只保存在未跟踪的 `.tmp/remote-workspace-nas/`，私密文件权限为 `0600`。

```sh
OWNDSH_E2E_TARGET=nas \
OWNDSH_E2E_WORK="$PWD/.tmp/remote-workspace-nas" \
OWNDSH_E2E_KEEP_RUNNING=true \
node .audit/remote-workspace-local-e2e.mjs
```

本轮按用户要求保留 NAS Host、Mac Controller、浏览器、Web 管理转发与本地模型协议夹具。保留进程退出后需要重新启动对应 Mac 组件；NAS 容器独立运行。模型流经过真实 Java 网关，但供应商是明确标记的本地 OpenAI 协议夹具。HTTP/WS、加密 Relay 通过不推导生产 TLS、实际 P2P/TURN、独立 Android/Web 管控台或外部真实模型供应商通过。

## 9. 代码责任

| 文件/模块 | 责任 |
|---|---|
| Java remote | 本人设备、pin、ticket、阶段状态、lease、认证重验、Relay。 |
| remote-core | Noise、加密 carrier、分片/信用窗口、协议边界。 |
| workspace-runtime | 登录生命周期、Host 开关、密钥、presence、逐页 link。 |
| dsh-carrier / dsh-policy | 原生独立 Peer/mux、端点与文件准入。 |
| view-registry | 固定目标、连接所有权、账号/代次、有界回收。 |
| view-mount / view-bootstrap | UI assembly 与业务分流、preboot、Storage 隔离。 |
| local-remote-api | 本机控制面认证和脱敏 API。 |
| ui | 设备选择、共享开关、状态条、返回本机、断线阻断。 |
