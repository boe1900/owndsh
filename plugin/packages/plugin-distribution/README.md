<!--
[INPUT]: 依赖受管插件调和、制品验证、官方命令边界和显式整包卸载实现。
[OUTPUT]: 提供默认免公钥安装、可选验签、安装/回滚/移除与新旧 Harness 库存兼容说明。
[POS]: @owndsh/plugin-distribution 的公开语义入口，界定中心期望与本地 Loader 事实。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# @owndsh/plugin-distribution

Harness Host 的受管插件调和 Service。它只消费 `ctx.enterprisePlatform` 的完整 bootstrap、
普通 Web 使用兼容 Harness 的 `ctx.subprocess`/`ctx.pluginInventory`，Desktop 使用公开
`desktopProfiles.current`/`desktopPnpm.runPlugin()`；本服务不会扫描或上传个人插件、配置、
源码和本地路径。
库存读取统一等待 `pluginInventory.list()`，同时支持 `0.1.1-rc.2` 的同步快照与
`0.1.2-rc.1`、`0.1.5-rc.2` 的异步快照；重启确认、移除、库存上报和整包卸载均使用同一读取边界。

管理员发布并配置可见范围后，插件进入员工目录。bootstrap/revision 轮询只刷新目录、确认重启和上报库存，不自动安装、升级或回滚；历史 `required=true` 也不触发安装。用户选择保留在当前设备/profile，其他设备独立选择。删除可见范围或退休版本会停止新安装，已有安装保留；显式 `ABSENT` 撤回会移除本机已受管插件。

用户调用 `install(packageName, pluginVersionId)` 后串行执行以下闭环：

1. 重新请求中心 `/plugins/assignments` 校验可见范围和所选版本；缓存同样重新授权，再把制品流式写入 `$DSH_HOME/enterprise/artifacts/<sha256>.tgz.part`。
2. 始终校验准确字节数、SHA-256 和 Harness/bundle/OS compatibility；仅在 `verifyPluginSignatures=true` 时额外使用固定 Ed25519 公钥验签。
3. 原子改名为 `<sha256>.tgz`，再以 argv 调用
   普通 Web 执行 `dsh plugin --profile <active-profile> add --ignore-scripts --save-exact <absolute-tgz>`，Desktop 委托当前 profile 的 `runPlugin()`。
4. 原子写入 `$DSH_HOME/enterprise/managed-plugins.json`，保持 `RESTART_REQUIRED`，不 HMR、
   不退出当前进程。
5. 下一进程联合状态文件的旧进程标记与 `pluginInventory.list()` 的 active Loader row，
   才把安装上报为 `ACTIVE`。ABSENT 同样要求下一进程确认 Loader row 消失后删除本地记录。

用户调用 `remove(packageName)` 使用同一环境原生命令边界，卸载后不会被轮询或重启重新安装。普通 Web 固定 argv 为 `dsh plugin --profile <active-profile> remove <package-name>`；Desktop 委托 `runPlugin(['remove', packageName])`。子进程边界会清理
ambient credential 与 `DSH_*`，因此本包显式只传回非秘密 `DSH_HOME`。stdout/stderr 仅作有界
进程诊断，不进入状态文件或库存。

`verifyPluginSignatures` 默认 `false`，员工只需填写 Server 地址并登录，无需配置公钥；关闭时也不解析配置中遗留的公钥。
大小、SHA-256、兼容性、逐请求授权和核心包保护始终生效。HTTP 内网模式信任部署网络与所连接的 Server；SHA-256 用于校验字节完整性，不能阻止同时篡改包与元数据的中间人。

需要验签时，在 Harness profile 的 `owndsh` 配置中显式开启，并填写对应部署的公钥：

```yaml
- id: owndsh
  config:
    verifyPluginSignatures: true
    trustedPluginPublicKey: '<部署专属 Ed25519 SPKI PEM 或 DER Base64>'
```

信任公钥只来自安装层 Config；bootstrap 没有修改验签开关或替换信任根的入口。开启后，缺失公钥或签名不匹配会在目录和安装路径上以 `ENT_PLUGIN_SIGNATURE_INVALID` 阻断；缓存制品同样执行所选策略。
服务端 `ENT_PLUGIN_SIGNING_ENABLED` 默认 `false`，无需配置私钥，返回 `signatureBase64: ""`；客户端关闭验签时接受空签名，开启时拒绝。需要签名的部署同时设置服务端 `ENT_PLUGIN_SIGNING_ENABLED=true` 和 `ENT_PLUGIN_SIGNING_PRIVATE_KEY`。开启只影响新上传版本，不补签历史无签名版本（同版本幂等上传也不补签），需上传新的插件版本后再要求客户端验签。
通用分发拒绝
bundle、platform client、distribution 自身以及 contracts、LLM、Session、UI 等企业核心传递包。
版本回滚与升级使用同一个校验策略和 exact tgz 安装路径，任一步失败都保持 `FAILED`，绝不标记 active。
OwnDsh 本体按 Harness caret peer 范围运行；第三方制品仍坚持独立的精确 commit 白名单。已映射官方 `0.1.1-rc.2`、`0.1.2-rc.1`（`a66e4702047846cdaa10c66c9d3df3951f5ea70d`）和 `0.1.5-rc.2`（`fb2c4b9e698e30edb738bca4cf0618587db7d203`）；其他未知版本以 `ENT_PLUGIN_INCOMPATIBLE` 拒绝安装。市场在安装前显示信任根/兼容性阻断原因。

升级部署时必须同时更新员工 `owndsh-plugin`：旧客户端把 `INSTALLED` 当成自动安装指令，仅升级后台或把 `required` 改为 false 无法改变旧客户端行为。本地状态文件保持兼容；空签名响应要求新版客户端，后台新保存的可见范围统一写入 `required=false`。
本地状态文件无法校验时，调和器进入稳定的 `ENT_PLUGIN_STATE_INVALID` 终态并丢弃后续 pending revision，避免 Host 忙循环；修复状态后需重启 Harness 重新载入。

员工可从企业界面显式卸载：Service 先通过同一官方命令边界移除当前已安装的受管包，清空受管状态，
最后移除 `owndsh-plugin`。调用层只在成功响应写回后请求 Desktop 官方重启；普通 Web 不管理宿主进程。
