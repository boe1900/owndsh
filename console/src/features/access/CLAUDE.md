# access/

> L2 | 父级: ../CLAUDE.md

成员清单

access-policy-page.tsx: 通过 OpenAPI operation、TanStack Query 和 bootstrap 权限事实管理消费侧模型授权与配额策略；页头复用 coss UI `Tabs`，列表复用 `ProductDataTable`，状态与对象胶囊统一使用 coss `Badge`/`Avatar`/`Button`/`Select`/`Alert`；一条策略一行，配额按 policyType 呈现启用窗口胶囊（compactTokens 可读额度）和组织/成员速率限制，并隐藏由模型提供商页管理的 PROVIDER RATE。
policy-editors.tsx: 结合 TanStack Form/Zod 与 coss UI (`Avatar`/`Badge`/`Button`/`Card`/`Checkbox`/`Empty`/`Field`/`Fieldset`/`Input`/`InputGroup`/`Switch`/`Alert`) 提供模型授权、互斥 TOKEN/RATE 策略编辑器与删除确认弹窗，共享 SubjectPicker/ResourcePicker/StatusToggle 三组件；TOKEN 表单只含四窗口，RATE 表单只含 RPM/并发，nullable 范围规范化为 null。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
