# skills/

> L2 | 父级: ../CLAUDE.md

成员清单

skill-management-page.tsx: 管理端公开/私有 skill release 导入预检、导入页内创建及独立管理凭据、发布/撤销/恢复、版本历史和回滚工作台；目录按技能聚合为一行且默认全状态筛选，被折叠的待发布草稿以历史按钮红点提醒并支持行级发布，版本历史内可发布/恢复/回滚，「发布新版本」按钮防换行；发布、撤销、回滚和凭据撤销统一确认，并展示固定 commit 的源码链接；只消费生成的 OpenAPI SDK，不管理用户、设备或租户分配。
skill-management-page.test.tsx: 验证待发布新版本的折叠红点与行级发布、版本历史内发布、草稿/撤销技能默认全状态可见、导入成功后立即发布的 revision 提交。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
