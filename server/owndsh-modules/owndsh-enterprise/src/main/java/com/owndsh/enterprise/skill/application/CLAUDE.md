# skill/application/

> L2 | 父级: ../CLAUDE.md

成员清单

SkillCatalogService.java: 草稿登记、发布/撤销/恢复和审计/revision 编排；Git 源导入复用 register。
SkillArchiveValidator.java: 规范化 GitLab/GitHub ZIP、解析 WorkBuddy frontmatter、限制路径/大小/文件数并计算 SHA-256。
SkillSourceClient.java: 公开源码固定 revision 导入端口与不可变归档 DTO。
HttpSkillSourceClient.java: GitHub API/codeload 与自托管 GitLab API/archive 的 HTTPS 只读 adapter。
SkillArtifactStore.java: skill artifact 访问 DIP 端口，并定义固定 release artifact 坐标。
FilesystemSkillArtifactStore.java: 以 SHA-256 文件名原子保存 artifact 的单机 adapter；后续可替换为 GitLab Package Registry。
GitLabSkillArtifactStore.java: 通过固定 generic package 坐标上传/读取制品，重复坐标只接受相同字节，设备不接触 GitLab 凭据。
SourceArchiveSkillArtifactStore.java: 声明回源 provider，导入和 runtime 均不在服务端持久化 skill ZIP。
SkillImportService.java: 组合源码解析、归档校验、可选 artifact 保存和 catalog DRAFT 登记，不自动发布。
SkillMutationContext.java: 管理端可信租户、操作者和请求审计上下文。
SkillAuditMetadata.java: skill 管理操作的固定审计 metadata 白名单。
SkillResourceNotFoundException.java: 当前租户资源不存在的稳定 404 异常。
EffectiveSkillResolver.java: 读取已发布目录和 BOOTSTRAP revision。
SkillRuntimeService.java: 校验 ACTIVE Harness 设备并提供已发布目录与制品查询。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
