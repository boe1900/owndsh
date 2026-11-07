<!--
[INPUT]: Remote、Paseo、paseo-dsh-direct 固定提交源码与既有组件测试；remote-access-research-20261106.md 的 Remote/AA/DSH Go 证据；OwnDsh 当前账号、设备、插件与控制台边界。
[OUTPUT]: 提供远程能力的选型结论、源码依据、Java/TypeScript 复用边界及安全与体验验收要求，明确预研结果不代表集成完成。
[POS]: docs 的远程选型入口，汇总前期证据并指导后续实施设计；原报告保留细节，实际 DSH 版本契约仍由 dsh-compatibility.md 拥有。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# OwnDsh 远程能力：Remote 与 Paseo 选型结论

核对日期：2026-11-07。状态：**选型收敛，尚未实施。停止扩展 Paseo 预研，采用 Remote 核心能力接入 OwnDsh。**

## 1. 产品目标与结论

用户登录 OwnDsh 客户端，在“设置 → 账号”开启“允许远程控制本机”；随后以同账号登录 OwnDsh 管控台，选择本人设备，在网页操作该设备正在运行的 DSH。会话、工作目录、工具和模型调用继续归原 Host，体验覆盖会话管理、流式消息、打断、审批、文件和终端。

**选择 Remote，抽取连接、加密和原生 DSH 桥接能力。账号、设备归属、开关、服务端与前端继续由 OwnDsh 拥有。** 产品保留 WebRTC（LAN/P2P/TURN）与端到端加密 WebSocket Relay，技术原型的实施顺序不构成功能删减。

Paseo 的实现具备真实价值，但当前 DSH Direct 路线需要 Paseo daemon、Provider 协议及 DSH → Paseo 时间线转换；它更适合由 Paseo 管理 Agent 运行和操作界面。OwnDsh 只需要为现有 DSH 增加远程入口，引入这套体系增加了重复职责。

此结论依据运行时接入方式和维护边界，不依据 README、仓库体量、星数或测试数量评分。Remote 原服务端也不能原样部署后直接当作 OwnDsh 多用户远程服务。

## 2. 固定源码快照

| 对象 | 固定提交与版本 | 核对范围 |
| --- | --- | --- |
| [Remote](https://github.com/liguobao/ds-harness-remote/tree/b689d7f8f837f6adfbf9728b4ebb47c39d8834d6) | `b689d7f8f837f6adfbf9728b4ebb47c39d8834d6`；插件 0.6.3 | Server、协议、Noise、Host 桥接、client-core、WebRTC、Android；细节见原报告 |
| [Paseo](https://github.com/getpaseo/paseo/tree/ec3ae09926b94273b96b7590c6fa7f098b30ed8c) | `ec3ae09926b94273b96b7590c6fa7f098b30ed8c`；0.15.3 | Relay、client、protocol、plugin，以及 daemon 的配置、认证、权限、会话、文件和终端关键路径 |
| [paseo-dsh-direct](https://github.com/Jecvay/paseo-dsh-direct/tree/3800739edd505a25d0e3a37ba92cf05a51d50744) | `3800739edd505a25d0e3a37ba92cf05a51d50744`；0.2.15 | DSH 启动、原生服务桥接、Provider、会话恢复、审批及时间线投影 |

Paseo 读取了完整远端文件索引并按路径下载选定源码，未完成整个 monorepo checkout 或全量构建。DSH Direct 声明的 SDK/peer 基线为 0.14.0，本轮没有验证其与 Paseo 0.15.3 的组合兼容性；版本差异本身也不能证明不兼容。

许可原文：Paseo 主体使用 Apache-2.0，第三方部分保留各自许可；DSH Direct 使用 MIT。Remote 所读许可材料使用/声明 MIT。复用时保留版权与许可，未完成全部依赖或发行制品的许可审计。

## 3. 决定适配成本的源码差异

### 3.1 Remote 桥接当前 Host

Remote 的请求沿 `client-core → 加密传输 → ConnectionController → HarnessRemoteBridge → 官方 Gateway` 进入原运行时。[harness-remote-bridge.ts](https://github.com/liguobao/ds-harness-remote/blob/b689d7f8f837f6adfbf9728b4ebb47c39d8834d6/packages/plugin/src/harness-remote-bridge.ts) 检查端点白名单，再派发调用和事件流；文件与终端也有真实接线。

这与“开启本机远程开关，再从网页继续操作原 DSH”一致。白名单和 Gateway 仍受 Harness 版本影响，并非任意新 API 自动可用。

共享 TS 客户端有 Android 的组装参考，DSH Go 也提供了自有 UI 接入 Remote 的独立实现。但 Remote 完整网页源码尚未在公开仓库找到，不能把公开站点演示等同于可直接嵌入的页面；OwnDsh 浏览器仍需适配身份存储、WebRTC、文件处理和界面。

### 3.2 DSH Direct 启动并管理 DSH

[index.server.ts](https://github.com/Jecvay/paseo-dsh-direct/blob/3800739edd505a25d0e3a37ba92cf05a51d50744/index.server.ts) 向 Paseo 注册 DSH Provider，调用 `launchDshBridge`。实际启动逻辑在 [bridge-client.ts](https://github.com/Jecvay/paseo-dsh-direct/blob/3800739edd505a25d0e3a37ba92cf05a51d50744/server/bridge-client.ts)：

1. 默认以官方 `web` 模板创建 `paseo` profile；也允许指定已有 profile。
2. 为桥接进程生成 patch，关闭 `web-startup`、`webserver`、`web-runtime`、`connection`、`api-remotes`，避免原 Web surface 抢先接收交互。
3. 启动 `dsh --profile ... --patch ...` 子进程，通过 stdin/stdout JSONL RPC 通信。

它确实直接使用 DSH 原生服务，并非仅靠通用 ACP。问题在于当前启动路径没有连接 OwnDsh Desktop 正在运行的 Gateway；指定相同 profile 也不等于接回原进程。

[service.ts](https://github.com/Jecvay/paseo-dsh-direct/blob/3800739edd505a25d0e3a37ba92cf05a51d50744/server/dsh/service.ts) 支持读取历史、保留原生 session ID 并调用官方 `agents.resume`。因此不能说它不支持已有 DSH 会话。但恢复由官方 SessionWriteLease 仲裁，其他客户端持有写租约时需要先释放，不等于透明地同时控制原窗口。

[provider.ts](https://github.com/Jecvay/paseo-dsh-direct/blob/3800739edd505a25d0e3a37ba92cf05a51d50744/server/provider.ts) 支持消息、命令、图片、steer、取消、会话配置、审批和问题回答；[timeline.ts](https://github.com/Jecvay/paseo-dsh-direct/blob/3800739edd505a25d0e3a37ba92cf05a51d50744/server/timeline.ts) 再将 DSH durable events/transient frames 转为 Paseo 累积时间线。功能并非只有聊天，但 OwnDsh 需要额外维护这层映射。

### 3.3 传输与界面各有取舍

| 维度 | Remote | Paseo + DSH Direct |
| --- | --- | --- |
| DSH 接入 | 桥接当前 Host 的原生 Gateway | Provider 启动 DSH 子进程并转换事件 |
| 原会话延续 | 沿原运行时操作 | 可导入/恢复原生会话，受 profile 和写租约约束 |
| 网络 | WebRTC LAN/P2P/TURN + 加密 WS Relay | 直接 WS + 加密 WS Relay；Desktop/CLI 还支持 SSH，Tailscale 可作为外部网络 |
| 网页复用 | 有共享 TS 操作客户端；完整公开 Web 源码未找到 | 完整 Expo/React Native App/Web 源码与类型化 client SDK 公开 |
| 文件与终端 | 桥接 DSH 对应能力 | Paseo daemon 自有文件与终端子系统 |
| OwnDsh 接入 | 替换身份、设备目录并补授权生命周期 | 同样要接身份，还需接受或改写 daemon/Provider/时间线边界 |
| 当前匹配度 | **较高** | 可行，但带入更多运行与业务体系 |

Paseo 的文件、终端不是 README 声明：[session.ts](https://github.com/getpaseo/paseo/blob/ec3ae09926b94273b96b7590c6fa7f098b30ed8c/packages/server/src/server/session.ts) 派发文件订阅、写入、上传与下载令牌请求，并交给终端控制器处理创建、订阅、输入和关闭；二进制终端帧还有来源归属检查。这些是 Paseo daemon 的能力，不能直接视为当前 DSH Gateway 的透明转发。

已读 client/relay/protocol 与 daemon transport 中未发现 WebRTC DataChannel、ICE/STUN/TURN 实现；实际路径由 WebSocket transport、Relay transport 及 [connectivity 文档](https://github.com/getpaseo/paseo/blob/ec3ae09926b94273b96b7590c6fa7f098b30ed8c/public-docs/connectivity.md) 相互印证。直接 WS 可以用于 LAN，但不能等同内置浏览器 WebRTC 穿透。

## 4. 安全判断

### 4.1 Paseo 已有防重放新协议，默认仍兼容旧模式

源码 [secure-channel.ts](https://github.com/getpaseo/paseo/blob/ec3ae09926b94273b96b7590c6fa7f098b30ed8c/packages/relay/src/secure-channel.ts) 与 [安全设计](https://github.com/getpaseo/paseo/blob/ec3ae09926b94273b96b7590c6fa7f098b30ed8c/docs/relay-endpoint-security.md) 一致：

- `protected` 使用 `Noise_NK_25519_ChaChaPoly_SHA256`、新 daemon ephemeral 与计数器，拒绝录制重放、重复和乱序记录；两个新版端点会正常协商此模式。
- `legacy` 使用 X25519 + NaCl box 与随机 nonce，缺少重放保护。
- [config.ts](https://github.com/getpaseo/paseo/blob/ec3ae09926b94273b96b7590c6fa7f098b30ed8c/packages/server/src/server/config.ts) 中 `requireProtectedSecurity` 默认 `false`，daemon 仍可接纳旧客户端；客户端 pinning 不能阻止攻击者重放过去录制的 legacy 会话。
- 强制 protected 可以关闭该兼容入口，但不会自动断开已入场的 legacy 会话，需要主动断连或重启完成切换。

这是可修正的默认兼容策略问题，不足以单独否决 Paseo，更不能概括为“Paseo 没有安全加密”。本轮运行的既有测试覆盖了 protected 重放拒绝、协商防降级和旧版本兼容；没有另行复现 legacy 录制攻击。

### 4.2 两者都需 OwnDsh 授权适配

Paseo 有实际的操作级权限检查和权限替换机制，覆盖 workspace、daemon、access 等范围。不能说它没有权限系统。但普通 daemon admission 在未设密码时返回 owner，密码校验通过时也返回 owner，见 [session-admission-auth.ts](https://github.com/getpaseo/paseo/blob/ec3ae09926b94273b96b7590c6fa7f098b30ed8c/packages/server/src/server/session-admission-auth.ts)。它不是现成的 OwnDsh 租户/用户/设备归属体系；也不能脱离绑定地址、远程开关和配对信息分发边界，断言默认公网裸奔。

Remote 使用 Noise IK 与双方静态身份，Relay 可只转密文；其原生桥接为获准连接创建 Owner Peer。初次公钥信任仍依赖服务端设备目录，默认单账号 Server 需要替换。关闭、账号停用、设备撤销对所有既有通道的统一约束也需补齐，尤其是绕过数据中继的 P2P 路径。

**采用 Remote 的理由是边界更贴合需求，不代表已经证明它在所有安全维度胜过 Paseo。** E2EE 保护正文，不替代账号授权、终端权限、可信前端交付或操作审计。

## 5. OwnDsh 实施边界

| 层 | 归属与复用方式 |
| --- | --- |
| 登录、用户与设备归属 | 复用 OwnDsh 账号、Host credentials 与 installation，不保留独立 Remote 账号体系 |
| “允许远程控制本机” | 在 OwnDsh 设置的账号 tab 增加开关，默认关闭；开启建立远程连接，关闭立即在 Host 停止接入并清理通道 |
| 服务端 | Java 实现受控连接授权、兼容信令与密文 Relay，复用既有持久化、日志和审计 |
| ICE/TURN | 保留 ICE 配置与 TURN 临时凭据；独立 coturn 承担 TURN 数据中转，Java 不实现 TURN 协议 |
| Host | 抽取 TS 的身份校验、Noise、WebRTC、RPC/流与 Harness Gateway 桥接，纳入现有插件生命周期 |
| 浏览器 | OwnDsh 导航与本人设备入口，适配共享 TS client-core；DSH 操作页复用已有组件或验证官方 Web 连接适配 |

Java 服务端处理信令和密文，不需要实现 Noise 握手或解密业务 RPC。移植难点在保序、有界队列、握手状态转换、替换连接竞态与撤权行为等价，语法相似不能替代协议验证。作者 C# 服务端截至 11 月 6 日的公开性查询未找到可读取源码，详见原报告，不将其作为实施前提。

现有 Console 尚需增加 employee 可访问的本人设备与远程入口，不能为了使用远程功能授予管理员角色。浏览器通过既有 HttpOnly Cookie 会话申请短期、绑定目标与客户端公钥的连接授权；Host Refresh Grant 不进入网页或 URL。

安全必须与远程通道一起实现：同租户同用户的目标绑定、Host 开关校验、严格端点白名单、受控浏览器 Origin、设备密钥绑定，以及退出/换号/账号停用/installation 撤销后的新旧连接失效。P2P 必须有统一授权租约和明确失效上界，失去授权确认后不能无限继续控制。管理员治理权限不自动转化为员工终端执行权。

原 Owner 白名单中的 credentials、插件管理和 settings 等能力应逐项审定。OwnDsh 私有本机 API、OAuth 回调和本机文件选择器需要按远程浏览器与工作设备的位置分别适配，不能放松回环/Origin 检查来换取页面可用。Relay 审计连接元数据，细粒度操作审计由 Host 提供。

## 6. 实施验收门槛

1. **原运行时：** 浏览器进入工作设备原 DSH 会话，验证历史、消息/流、取消、审批、文件与终端，确认工作目录和模型请求仍归原 Host。聊天通路只是探针，不是完整交付。
2. **归属隔离：** 两账号两设备，篡改目标 ID、session ID 或客户端公钥不能互访；开关默认关闭，重启与账号切换不继承错误授权。
3. **撤权闭环：** 本机关闭、退出、停用和设备撤销均阻止新连接，并在约定上界内断开旧连接；覆盖 LAN/P2P/TURN/Relay 及断网重连。另行定义此前已提交任务是否继续。
4. **网络与发行：** 验证真实跨网直连、TURN、Relay 回落、睡眠唤醒、附件/终端流和慢消费者；核对实际桌面/插件/Harness 组合。版本范围声明不代替实测。

## 7. 已有验证与限制

| 组件 | 本次研究期间执行结果 | 范围 |
| --- | --- | --- |
| Remote | 93 项通过 | 原 TS Server、crypto、ConnectionController、HarnessRemoteBridge；非 Java 移植验收 |
| Remote Android | 23 项通过 | 工具端点、加密传输与连接服务组件；未构建 APK |
| Paseo Relay | 92 项通过 | Noise 7、crypto 21、encrypted-channel 15、protected-records 16、secure-channel 24、Cloudflare adapter 9 |
| DSH Direct | 111 项通过 | bridge-client、DSH service、runtime-safety、dsh-spawn、timeline 共 5 个既有测试文件 |

Paseo/Direct 测试使用 Node 24.14.1，在隔离目录关闭依赖安装脚本，按 manifest 允许范围解析依赖，未按完整上游 workspace 锁文件重建。Relay 使用独立 Vitest 配置，Direct 使用 `node --import tsx --test`；业务源码和既有测试均未修改。本轮未运行依赖 `@getpaseo/plugin` 运行时的 Direct Provider 集成测试，不将上述组件结果计作 SDK 组合兼容通过。

Paseo 加密测试使用内存传输，Cloudflare adapter 使用测试替身，Direct 的 Host 主要使用替身；未启动真实 DSH，不代表真实跨机、实际 Cloudflare 部署或公网穿透通过。原始日志位于本机临时研究目录，随临时目录清理会丢失，未作为长期验收制品提交。

**未验证：OwnDsh 浏览器产品集成、Java Relay、真实跨机/NAT/TURN、全量 Paseo 构建、DSH Direct 与 Paseo 0.15.3 组合、长期负载和独立密码审计。** 本次仅提交研究文档，下一步是按上述边界设计和验证 Remote 接入。

Remote/AA、Android、DSH Go、C# 查询及前次测试方法的完整证据见 [原预研报告](remote-access-research-20261106.md)；实际 Harness 版本与升级约束见 [依赖契约](dsh-compatibility.md)。
