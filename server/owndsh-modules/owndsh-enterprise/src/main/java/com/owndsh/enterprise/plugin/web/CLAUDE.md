# plugin/web/

> L2 | 父级: ../CLAUDE.md

成员清单

PluginAssignmentBatchRequest.java: 最多 200 条原子 assignment replacement 请求与领域约束转换。
PluginInventoryRequest.java: 最多 500 条 runtime inventory replacement 请求与观测时间转换。
PluginRegistrationRequest.java: JSON 包名、版本与安装配置登记输入。
PluginViews.java: 包身份、安装配置、可见范围与库存的唯一 HTTP 投影，BootstrapView 复用 runtime 投影。
AdminPluginController.java: ent:plugin 权限保护的 JSON 登记、目录、发布/退休、可见范围与库存入口。
RuntimePluginController.java: ACTIVE Harness 设备的授权目录与库存上报入口。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
