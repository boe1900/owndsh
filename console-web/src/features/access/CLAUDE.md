# access/

> L2 | 父级: ../CLAUDE.md

成员清单

access-policy-page.tsx: 通过 OpenAPI operation、TanStack Query 和 bootstrap 权限事实管理模型授权与配额策略，以统一 ProductDataTable 分别呈现模型访问、使用限额和速率限制，并为写入注入 UUID 幂等键与 CAS revision。
policy-editors.tsx: 使用 TanStack Form、Zod、共享成员目录和 Beautiful UI 控件收集 ALL_MEMBERS/MEMBER 授权及 ORGANIZATION/MEMBER 配额，组织级主体规范化为 null，不允许手填成员 ID 且不持有 Server mutation。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
