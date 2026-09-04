# plugin/domain/

> L2 | 父级: ../CLAUDE.md

成员清单

PluginCompatibility.java: 冻结 Harness commit 集合、企业 bundle SemVer range 和受支持 OS 的规范化值对象。
PluginPackage.java: tenant 内 npm package 聚合根与 assignment CAS revision。
PluginVersion.java: 制品 hash、签名、compatibility 和 UPLOADED→VALIDATED→PUBLISHED→RETIRED 状态事实。
PluginAssignment.java: ALL/DEPT/USER 主体、INSTALLED/ABSENT 期望态与 required 约束。
RuntimePluginAssignment.java: 客户端校验和调和所需的唯一脱敏下载投影。
DevicePluginInventory.java: ACTIVE 设备上报的本地调和状态和 Loader 观测事实。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
