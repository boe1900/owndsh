# skill/web/

> L2 | 父级: ../CLAUDE.md

成员清单

AdminSkillController.java: 登录管理会话保护的目录、公开源码导入、草稿登记、发布/撤销管理入口；不定义 Skill 专用权限。
SkillSourceImportRequest.java: 公开 GitLab/GitHub 固定 revision 导入请求 DTO，不接受 token 或上传正文。
SkillRegistrationRequest.java: 已验证 release 元数据登记 DTO；不接收源码正文或来源凭据。
SkillViews.java: release catalog、runtime 的统一脱敏投影。
RuntimeSkillController.java: ACTIVE Harness 设备的已发布目录与制品回源下载入口。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
