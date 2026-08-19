# model/web/

> L2 | 父级: ../CLAUDE.md

成员清单

ProviderWriteRequest.java: provider 创建/更新写 DTO，credential 只以 char[] 短暂存在并显式清零。
ProviderTestRequest.java: 未保存 endpoint/timeout 与可选新 credential 的探测 DTO。
ProviderView.java: provider 管理脱敏输出，只公开 credentialConfigured。
AdminProviderController.java: provider list/get/create/update/test/enable/disable 与 ent:model 权限入口。
ManagedModelWriteRequest.java: 受管模型创建/更新协议到 application spec 的转换 DTO。
ManagedModelView.java: provider 名称与模型能力的管理安全投影。
AdminManagedModelController.java: 模型 CRUD/排序字段更新/启停与 ent:model 权限入口。
ModelGrantWriteRequest.java: 单条授权写 DTO 与 application spec 转换。
ModelGrantBatchRequest.java: 最多 200 条授权的原子批量请求边界。
ModelGrantView.java: subject/model 展示名与 revision 的管理投影。
AdminModelGrantController.java: 授权 list/create/update/delete/batch 与 ent:grant 权限入口。
DeletedModelResourceView.java: 模型/授权删除成功的统一 id/deleted 投影。
BootstrapView.java: T06 严格客户端消费的完整脱敏 bootstrap 外壳及模型/配额/插件切片。
BootstrapController.java: 只接受 ACTIVE dsh-desktop 设备的 runtime bootstrap 入口。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
