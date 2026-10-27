# model/web/

> L2 | 父级: ../CLAUDE.md

成员清单

ProviderWriteRequest.java: 供应商名称与类型元信息写 DTO；endpoint 和 credential 不在此边界出现。
ProviderConnectionView.java: 连接脱敏管理投影。
ProviderConnectionWriteRequest.java: 连接写入、模型发现路径与一次性密钥边界。
AdminProviderConnectionController.java: 连接管理 API。
AdminProviderConnectionProbeController.java: 未保存连接模型发现 API。
AdminProviderConnectionTestController.java: 已保存连接模型发现 API。
ProviderView.java: providerKey/type/status 管理投影，不公开连接 endpoint 和 credential。
AdminProviderController.java: provider list/get/create/update/enable/disable 与 ent:model 权限入口。
ManagedModelWriteRequest.java: 受管模型创建/更新协议到 application spec 的转换 DTO，保留 reasoningEfforts 省略/false/object 三态。
ManagedModelView.java: provider 名称、容量、reasoningEfforts 与 completions compat 的管理安全投影。
AdminManagedModelController.java: 模型 CRUD/排序字段更新/启停与 ent:model 权限入口。
ModelGrantWriteRequest.java: MODEL_SET/MODEL 资源与 ALL_MEMBERS/ACCESS_GROUP/MEMBER 主体的单条授权写 DTO 及 application spec 转换。
ModelGrantBatchRequest.java: 最多 200 条授权的原子批量请求边界。
ModelGrantView.java: nullable subjectId、subject/model 展示名与 revision 的管理投影。
AdminModelGrantController.java: 授权 list/create/update/delete/batch 与 ent:grant 权限入口。
ModelSetWriteRequest.java: 模型集名称与完整模型 ID 列表写入边界。
ModelSetView.java: 模型集名称、成员模型 ID、计数和 revision 管理投影。
AdminModelSetController.java: 模型集 list/get/create/update/delete 与 ent:model 权限入口。
DeletedModelResourceView.java: 模型/授权删除成功的统一 id/deleted 投影。
BootstrapView.java: 完整脱敏 bootstrap，汇总模型/配额并复用 PluginViews 的安装配置投影，避免目录接口漂移。
BootstrapController.java: 只接受 ACTIVE dsh-desktop 设备的 runtime bootstrap 入口。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
