<!--
[INPUT]: docs/remote-access-implementation-design.md 的已确认首期范围与待产品决策。
[OUTPUT]: 提供首期 Remote 连接基础的范围冻结和后续业务决策清单。
[POS]: OwnDsh Remote 的产品决策附录，被主实施文档引用；不定义 wire 或实现接口。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# OwnDsh Remote 产品决策

本文记录 Remote 首期连接基础的范围以及进入业务阶段前必须确认的产品取舍。

## 1. 已确认范围与后续决策

你已确认产品首期连接基础的范围：首版先打通插件端、服务端和 Web 管控台接口，具体业务功能和正式页面后置。对应冻结如下：

| 项目 | 产品首期连接基础决定 |
| --- | --- |
| 首版业务 | 不实现会话、文件、终端、审批、模型和插件操作 |
| 首版客户端 | Web 管控台；Android 只保留后续接口 |
| 首版数据路径 | 开发先用 Web ↔ Java Relay ↔ Host 打通；产品验收必须包含 LAN/P2P/TURN/Relay，Noise 必须打通 |
| WebRTC/TURN | 本阶段正式实现 adapter、信令和 coturn 接缝，不做临时占位 |
| 页面 | 只做设备列表、连接状态和调试连接面板，正式页面另行设计 |
| Host Bridge | 只做能力探测、`host.describe` 和未实现 endpoint 的统一错误 |

以下问题不会阻塞产品首期连接基础，但在进入业务功能前必须确认：

1. **业务阶段的文件写入权限**
   - A（推荐）：首版只读 + 下载；
   - B：允许上传/覆盖指定 workspace 文件；
   - C：再加删除、重命名、目录创建。每一项都要单独审计和确认对话框。

2. **业务阶段的终端能力**
   - A：只读输出；
   - B（推荐）：输入/resize/close；
   - C：B + retain/follow 和多个终端。

3. **Backend 范围**
   - A（推荐）：只支持当前 OwnDsh Harness 主链；
   - B：保留统一 capability 扩展点，后续按需增加 ACP/Codex；
   - C：首版同时覆盖上游列出的全部 backend。

4. **Android 技术栈**
   - A（推荐）：Kotlin 原生 + Android WebRTC；
   - B：Flutter + `flutter_webrtc`；
   - C：先交付 Web，Android 后置。

5. **Web/Android 核心复用方式**
   - A（推荐）：共享 wire schema、错误、fixture 和授权契约；Web/Android 各自实现平台 transport；
   - B：Android 也使用可复用 TypeScript runtime（需要额外 JS runtime/桥接成本）；
   - C：两端完全独立实现。

6. **连接恢复**
   - A（推荐）：首版断线重新建链；
   - B：首版同时实现 `transport.webrtc.resume.v1` 和 Relay attach/resume；
   - C：只做 Relay resume，WebRTC 仍重建。

7. **管理员远控**
   - A（推荐）：只允许设备所有者；
   - B：管理员可在显式授权和完整审计下远控；
   - C：管理员永远不能操作员工 Host。

8. **Java Remote Gateway 部署**
   - A（推荐）：首版 Spring Boot 生命周期内嵌 Netty listener，未来按容量拆分；
   - B：从第一版开始独立 Remote Gateway 进程；
   - C：暂只做同机/内网，不部署公网 Relay。

9. **Lease 失效上界**
    - A（推荐）：TTL 60 秒、续租 20 秒，先以实测 P99 校准；
    - B：更短 TTL（需要更高心跳和移动端耗电）；
    - C：更长 TTL（撤权窗口更大）。

10. **上游互通**
    - A（推荐）：不追求上游业务互通，只复用核心语义；
    - B：只兼容 control/relay wire，不兼容认证和业务；
    - C：未来提供完整上游 adapter，包括设备注册、membership 和业务 RPC。

11. **服务器数据保留**
    - A（推荐）：Server 只保留连接元数据，正文和文件只在 Host/控制端；
    - B：允许显式开启会话审计副本；
    - C：默认保存会话正文和文件历史。此选项会显著改变加密、隐私、配额和合规设计。

产品首期连接基础可以按已确认范围直接拆成 Java、Plugin、Web 三条开发任务；上表的业务决策在进入对应阶段前再确认。
