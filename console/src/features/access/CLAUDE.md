# access/

> L2 | 父级: ../CLAUDE.md

成员清单

access-policy-page.tsx: 通过 OpenAPI operation、TanStack Query 和 bootstrap 权限事实管理消费侧模型授权与配额策略；模型访问复用统一 ProductDataTable，将资源描述/数量、供应商与连接上下文规格、主体胶囊数组（用户组含人数、成员首字母头像）、彩色首字母和真实更新时间投影进原型列，一条策略一行，配额按 policyType 呈现启用窗口胶囊（compactTokens 可读额度）和组织/成员速率限制，并隐藏由模型提供商页管理的 PROVIDER RATE。
policy-editors.tsx: 使用 React 状态和共享目录收集原型式资源卡片、搜索、多选用户组/成员主体集合及消费侧多资源策略，编辑回填 subjects 数组，配额成员多选（选择器追加 + 胶囊移除）；模型资源复用连接名称与 token-capacity 格式，成员复用稳定首字母头像，TOKEN 表单只含四窗口（勾选开启默认值、≈ 可读徽章与 500K–200M 预设胶囊，不再展示当前用量），RATE 表单只含 RPM/并发，nullable 范围规范化为 null，主体集合与模型访问授权同构（全员/用户组/成员），并统一使用语义色 token 适配 dark mode。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
