# skill/web/

> L2 | 父级: ../CLAUDE.md

成员清单

AdminSkillController.java: 登录管理会话保护的目录、公开源码导入、草稿登记、发布/撤销/恢复管理入口；不定义 Skill 专用权限。
SkillSourceImportRequest.java: 公开/私有 GitLab/GitHub 固定 revision 导入请求 DTO，只接受凭据引用，不接受 token 或上传正文。
SkillRegistrationRequest.java: 已验证 release 元数据登记 DTO；不接收源码正文或来源凭据。
SkillViews.java: release catalog、runtime 的统一脱敏投影；管理目录返回固定 commit 的源码仓库链接。
RuntimeSkillController.java: ACTIVE Harness 设备的已发布目录与制品回源下载入口。
AdminSkillSourceCredentialController.java: 管理端仓库凭据列表、创建、轮换和撤销入口。
SkillSourceCredentialWriteRequest.java: 一次性 token 写 DTO，负责输入复制与清零。
SkillSourceCredentialViews.java: 仓库凭据脱敏列表投影。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
