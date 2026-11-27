# members/

> L2 | 父级: ../CLAUDE.md

成员清单

member-management-page.tsx: 通过生成 operation、TanStack Query 与 coss UI (`Tabs`/`Avatar`/`Badge`/`Button`/`Card`/`Checkbox`/`Empty`/`Field`/`Fieldset`/`Input`/`Select`/`Spinner`/`Alert`) 聚合成员、用户组与身份接入分段，交付目录筛选、详情四区块卡片、LOCAL 建号、LDAP 单人导入、角色、状态与多身份治理；成员状态和登录身份解除统一经确认弹窗，不读取部门、原始 claims 或 V1 已隐藏的 Session 摘要。
access-group-management.tsx: 通过生成的用户组 operation、TanStack Query/Form、产品表格/对话框与 coss UI (`Button`/`Card`/`Checkbox`/`Field`/`Input`/`InputGroup`/`Alert`) 管理扁平用户组及完整手工成员集合，写入遵循 UUID 幂等键与 revision CAS，删除失败只在确认弹窗展示阻塞计数。
identity-source-management.tsx: 通过生成 operation 与 coss UI `Badge`/`Button`/`Alert` 管理默认筛选启用项的 OIDC/LDAP/LOCAL 身份源、连接测试和 CAS 启停；仅在 LDAP 行暴露组映射操作。
identity-source-editor.tsx: 基于 coss UI `Button`/`Field`/`Input`/`Select`/`Alert` 收集 OIDC、LDAP 用户/组发现配置与 LOCAL 名称；LDAP 仅以 URL 区分明文/TLS，请求固定 startTls=false 且不回显 secret。
identity-source-editor.test.ts: 锁定创建、更新和 LOCAL provisioning mode 的 secret 隔离语义，以及 LDAP 组发现字段投影。
ldap-member-import.tsx: 基于 coss UI `Button`/`Input`/`Select`/`Alert` 选择启用 LDAP 来源后有界搜索用户，并只提交 DN 触发服务端单人导入。
ldap-group-mapping.tsx: 基于 coss UI `Button`/`Field`/`Input`/`RadioGroup`/`Select`/`Alert` 维护 Group DN 到产品用户组的显式映射，不镜像成员或展开嵌套组。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
