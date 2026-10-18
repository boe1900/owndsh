# plugin/domain/

> L2 | 父级: ../CLAUDE.md

成员清单

PluginInstallation.java: 固定安装地址和无图标展示元数据的输入边界，依赖由宿主 pnpm 解析。
PluginMarketMetadata.java: DSH format 1 的包级标题、描述、来源展示、单分类、多标签与排序值。
PluginSource.java: DSH format 1 的 npm registry/Git commit 精确安装来源与 pnpm spec 派生。
PluginEngines.java: 版本级 DSH SemVer 兼容范围。
PluginPackage.java: tenant 内 npm package 聚合根、包级市场元数据与 assignment CAS revision。
PluginVersion.java: 不可变包身份、版本来源、发布时间与安装配置，状态为 VALIDATED→PUBLISHED→RETIRED。
PluginAssignment.java: ALL/DEPT/USER 主体、INSTALLED/ABSENT 期望态与 required 约束。
RuntimePluginAssignment.java: 当前用户有权安装的固定版本、来源与权限事实，供 bootstrap 和安装前重新授权共用。
DevicePluginInventory.java: ACTIVE 设备上报的本地调和状态和 Loader 观测事实。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
