# owndsh-system/

> L2 | 父级: ../../CLAUDE.md

成员清单

pom.xml: OwnDsh 系统管理模块依赖清单，保持基础系统不依赖企业治理实现。
src/main/java/com/owndsh/system/event/: 系统事务事件契约及发布器；用户治理事件只携带用户 ID、角色数量和状态变化等脱敏业务事实。
src/main/java/com/owndsh/system/service/impl/: 用户、角色、部门等系统应用服务；SysUserServiceImpl 在角色和状态事务成功后通知治理事件发布器，由上层企业模块选择性消费。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
