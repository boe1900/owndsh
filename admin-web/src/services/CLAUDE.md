# services/

> L2 | 父级: ../../CLAUDE.md

成员清单

enterprise/appendSessionBatch.ts: 生成的当前设备 Session batch 追加 operation 客户端。
enterprise/authorizePlatformClient.ts: 生成的 enterprise authorize operation 客户端。
enterprise/completeOidcLogin.ts: 生成的 OIDC 登录完成 operation 客户端。
enterprise/completePasswordLogin.ts: 生成的密码登录完成 operation 客户端。
enterprise/createGroupMapping.ts: 生成的外部组映射创建 operation 客户端。
enterprise/createIdentitySource.ts: 生成的身份源创建 operation 客户端。
enterprise/createManagedModel.ts: 生成的受管模型创建 operation 客户端。
enterprise/createModelGrant.ts: 生成的单项模型授权创建 operation 客户端。
enterprise/createModelGrantBatch.ts: 生成的批量模型授权创建 operation 客户端。
enterprise/createModelProvider.ts: 生成的模型 Provider 创建 operation 客户端。
enterprise/createQuotaPolicy.ts: 生成的配额策略创建 operation 客户端。
enterprise/deleteGroupMapping.ts: 生成的外部组映射删除 operation 客户端。
enterprise/deleteAdminSession.ts: 生成的管理端 Session tombstone 删除 operation 客户端。
enterprise/deleteManagedModel.ts: 生成的受管模型删除 operation 客户端。
enterprise/deleteModelGrant.ts: 生成的模型授权删除 operation 客户端。
enterprise/deleteOwnedSession.ts: 生成的员工本人 Session tombstone 删除 operation 客户端。
enterprise/deleteQuotaPolicy.ts: 生成的配额策略删除 operation 客户端。
enterprise/downloadPluginVersion.ts: 生成的受授权插件版本二进制下载 operation 客户端。
enterprise/disableIdentitySource.ts: 生成的身份源停用 operation 客户端。
enterprise/disableManagedModel.ts: 生成的受管模型停用 operation 客户端。
enterprise/disableModelProvider.ts: 生成的模型 Provider 停用 operation 客户端。
enterprise/disableQuotaPolicy.ts: 生成的配额策略停用 operation 客户端。
enterprise/enableIdentitySource.ts: 生成的身份源启用 operation 客户端。
enterprise/enableManagedModel.ts: 生成的受管模型启用 operation 客户端。
enterprise/enableModelProvider.ts: 生成的模型 Provider 启用 operation 客户端。
enterprise/enableQuotaPolicy.ts: 生成的配额策略启用 operation 客户端。
enterprise/enrollCurrentDevice.ts: 生成的当前设备登记 operation 客户端。
enterprise/exchangeAuthorizationCode.ts: 生成的授权码交换 operation 客户端。
enterprise/exportOwnedSession.ts: 生成的员工本人 Session 正文导出 operation 客户端。
enterprise/getDevice.ts: 生成的设备详情 operation 客户端。
enterprise/getEnterpriseBootstrap.ts: 生成的企业 bootstrap operation 客户端。
enterprise/getIdentitySource.ts: 生成的身份源详情 operation 客户端。
enterprise/getManagedModel.ts: 生成的受管模型详情 operation 客户端。
enterprise/getModelProvider.ts: 生成的模型 Provider 详情 operation 客户端。
enterprise/getPluginAssignments.ts: 生成的当前设备插件 assignment operation 客户端。
enterprise/getMyQuotaUsage.ts: 生成的员工当前配额用量 operation 客户端。
enterprise/getQuotaPolicy.ts: 生成的配额策略详情 operation 客户端。
enterprise/getQuotaPolicyWindows.ts: 生成的配额策略窗口 operation 客户端。
enterprise/getUserExternalIdentitySummary.ts: 生成的用户外部身份摘要 operation 客户端。
enterprise/heartbeatCurrentDevice.ts: 生成的当前设备 heartbeat operation 客户端。
enterprise/index.ts: 生成 operation 的聚合导出入口，不承载业务判断。
enterprise/listAdminSessions.ts: 生成的管理端 Session metadata cursor 列表 operation 客户端。
enterprise/listAuditEvents.ts: 生成的管理端审计九维筛选 cursor 列表 operation 客户端。
enterprise/listDevices.ts: 生成的设备 cursor 列表 operation 客户端。
enterprise/listGroupMappings.ts: 生成的外部组映射 cursor 列表 operation 客户端。
enterprise/listIdentitySources.ts: 生成的身份源 cursor 列表 operation 客户端。
enterprise/listManagedModels.ts: 生成的受管模型 cursor 列表 operation 客户端。
enterprise/listModelGrants.ts: 生成的模型授权 cursor 列表 operation 客户端。
enterprise/listModelProviders.ts: 生成的模型 Provider cursor 列表 operation 客户端。
enterprise/listOwnedSessions.ts: 生成的员工本人远端 Session cursor 列表 operation 客户端。
enterprise/listPluginInventory.ts: 生成的管理端设备插件 inventory cursor 列表 operation 客户端。
enterprise/listPluginPackages.ts: 生成的含版本与完整 assignment 集合的插件 catalog operation 客户端。
enterprise/listPublicIdentitySources.ts: 生成的公开身份源列表 operation 客户端。
enterprise/listQuotaPolicies.ts: 生成的配额策略 cursor 列表 operation 客户端。
enterprise/listUsageLedger.ts: 生成的 prompt-free 用量 ledger cursor 列表 operation 客户端。
enterprise/logoutPlatformSession.ts: 生成的平台会话注销 operation 客户端。
enterprise/publishPluginVersion.ts: 生成的插件版本发布 CAS operation 客户端。
enterprise/readAdminSessionContent.ts: 生成的管理端 Session 正文读取 operation 客户端。
enterprise/recordSessionRestore.ts: 生成的员工本人 Session 恢复审计 operation 客户端。
enterprise/replacePluginAssignments.ts: 生成的 package 全量 assignment 原子替换 operation 客户端。
enterprise/replacePluginInventory.ts: 生成的当前设备插件 inventory 原子上报 operation 客户端。
enterprise/retirePluginVersion.ts: 生成的插件版本退休 CAS operation 客户端。
enterprise/revokeDevice.ts: 生成的设备撤销 operation 客户端。
enterprise/startOidcLogin.ts: 生成的 OIDC 登录启动 operation 客户端。
enterprise/streamEnterpriseAnthropicMessages.ts: 生成的 Anthropic Messages 企业模型流 operation 客户端；管理端不直接消费此能力。
enterprise/streamEnterpriseChatCompletions.ts: 生成的 OpenAI Chat Completions 企业模型流 operation 客户端；管理端不直接消费此能力。
enterprise/streamEnterpriseResponses.ts: 生成的 OpenAI Responses 企业模型流 operation 客户端；管理端不直接消费此能力。
enterprise/testIdentitySource.ts: 生成的身份源连接测试 operation 客户端。
enterprise/testModelProvider.ts: 生成的模型 Provider 连接测试 operation 客户端。
enterprise/typings.d.ts: 生成 operation 共用的严格 API DTO 命名空间。
enterprise/updateIdentitySource.ts: 生成的身份源更新 operation 客户端。
enterprise/updateManagedModel.ts: 生成的受管模型更新 operation 客户端。
enterprise/updateModelGrant.ts: 生成的模型授权更新 operation 客户端。
enterprise/updateModelProvider.ts: 生成的模型 Provider 更新 operation 客户端。
enterprise/updateQuotaPolicy.ts: 生成的配额策略更新 operation 客户端。
enterprise/uploadPluginVersion.ts: 生成的受控 tgz multipart 上传 operation 客户端。

`enterprise/` 由 `contracts/generated/enterprise-openapi.json` 经 Umi OpenAPI 生成器整体重建，目录内文件头和实现受生成器控制且禁止手工编辑；手写认证、错误、幂等与 revision 语义位于 `src/api/enterprise/`。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
