# members/

> L2 | 父级: ../CLAUDE.md

成员清单

member-management-page.tsx: 通过生成 operation 和 TanStack Query 聚合成员、用户组与身份接入分段，交付 LOCAL 建号、LDAP 单人导入、角色、状态与多身份治理，不读取部门、原始 claims 或 V1 已隐藏的 Session 摘要。
access-group-management.tsx: 通过生成的用户组 operation、TanStack Query/Form 和产品表格/对话框管理扁平用户组及完整手工成员集合，写入遵循 UUID 幂等键与 revision CAS。
identity-source-management.tsx: 通过生成 operation 管理 OIDC/LDAP/LOCAL 身份源、连接测试和 CAS 启停，并仅在 LDAP 行暴露绑定该来源的组映射操作。
identity-source-editor.tsx: 收集 OIDC、LDAP 用户/组发现配置与 LOCAL 名称，创建强制一次性 secret、更新留空不序列化 secret。
identity-source-editor.test.ts: 锁定创建、更新和 LOCAL provisioning mode 的 secret 隔离语义，以及 LDAP 组发现字段投影。
ldap-member-import.tsx: 选择启用 LDAP 来源后有界搜索用户，并只提交 DN 触发服务端重读与稳定 subject 单人导入。
ldap-group-mapping.tsx: 由身份接入表格中的 LDAP 行打开，按该固定来源发现目录组并维护 Group DN 到产品用户组的显式映射，不镜像成员或展开嵌套组。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
