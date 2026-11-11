# NAS 双机 DSH 工作区验收

- [x] 核对最新 main、已发布镜像和 home-nas 实际部署。
- [x] 保存 Compose、数据库及镜像回滚信息，部署同一提交的服务端和控制台。
- [x] NAS 启动官方 npm rc.5 DSH Web，使用独立 profile 与本轮插件。
- [x] Mac 启动隔离 Controller，真实员工登录，确认 Host 默认关闭并显式开启。
- [x] 跨物理机验证原生工作区、会话、模型流、文件、大响应、终端与远端文件副作用。
- [x] 验证断线阻断、刷新、失败重试、手动恢复和返回本机。
- [x] 记录实际镜像/插件哈希与验证边界，更新 GEB 文档。
- [x] 保留服务、两个测试 profile 和查看入口供用户检查，不在结束时关闭。
- [x] 修正模型夹具请求边界，隔离验证非法 JSON 后非流和 SSE 仍可用。
- [x] 独立复核证据、脚本和决策日志，提交并推送审计产物。

夹具修复采用 focused-fix exception。独立审阅已隔离复现非法 JSON 产生未处理 rejection 并退出，原因局限于测试 HTTP handler。修正保留接口、路由及产品状态，不涉及认证、授权、数据模型、并发或部署契约。直接提取实际 handler 可通过真实隔离 HTTP 请求验证，无竞争方案。skip: 不重复 how/why/architect 设计探索；仅由隔离副本生成最小补丁，主任务复核应用。

运行版本边界：14 项业务验收对应 `.tmp/remote-workspace-nas/run-1794377836171/result.json`。其后增加的 userInfo 证据采集、浏览器聚焦和模型夹具 400 处理通过语法或隔离专项检查，没有逐字版本全量复跑。保留环境未重启，仍运行该成功轮次的脚本。两端凭据启动后认证 API 均为 200/READY。

吞吐检查：先确认镜像来源与回滚，再部署；NAS Host 安装和 Mac 测试脚本准备可独立进行。既有 Compose 与数据库仅由主任务写入。单一编排者处理跨机生命周期，避免测试同时改写 profile。

完成条件：Mac 与 NAS 分别运行真实 Harness，业务请求经 NAS 协调/密文 Relay 到 NAS Host，Session、File、Terminal 在 NAS 发生且本机无同名副作用。SSH 转发仅用于访问 NAS 的回环管理页面，产品远控链路不借助该转发。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
