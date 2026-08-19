# plugin/web/

> L2 | 父级: ../CLAUDE.md

成员清单

PluginAssignmentBatchRequest.java: 最多 200 条原子 assignment replacement 请求与领域约束转换。
PluginInventoryRequest.java: 最多 500 条 runtime inventory replacement 请求与观测时间转换。
PluginViews.java: package/version/assignment/runtime/inventory 的统一脱敏 HTTP 投影。
AdminPluginController.java: ent:plugin 权限保护的 catalog、上传、发布、退休、分配和设备库存入口。
RuntimePluginController.java: ACTIVE Harness 设备的分配、重新授权且禁止 MIME sniff 的单 Range 下载和 inventory 上报入口。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
