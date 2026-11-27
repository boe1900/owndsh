# plugins/

> L2 | 父级: ../CLAUDE.md

成员清单

plugin-management-page.tsx: 通过生成 JSON API、Query、产品表格与 coss UI `Tabs`/`Badge`/`Button`/`Alert` 管理插件版本和可见范围；版本列表按 package 聚合为一行，历史版本弹窗保留新增、发布、退休和单版本删除；主列表可删除整个插件；保存后刷新目录并衔接发布确认，提交版本及包双 revision；目录分页收集完整分类。
plugin-management-page.test.tsx: 验证 npm 表单、package 聚合行与历史版本操作、资料继承、重复版本、保存后发布、双 revision 范围迁移、失败/冲突草稿保留、删除确认/取消/重复提交拦截、历史刷新、删除冲突、只读权限与版本/范围双视图。
plugin-editors.tsx: 结合 coss UI `Button`/`Card`/`Collapsible`/`Field`/`Input`/`Select`/`Alert` 提供首次登记与新增版本表单、发布范围沿用及范围编辑弹窗；新增版本默认展开可修改的沿用资料并锁定包名。
plugin-category-select.tsx: 基于 coss UI `Combobox`/`InputGroup`/`Label`/`Button` 组合已有/常用分类、搜索、新名称创建和可清空选择，遵守单项 40 字符边界并隔离 Enter/Escape 与外层表单，同时保持展开按钮独立的无障碍名称。
plugin-category-select.test.tsx: 验证单分类选择、创建、替换、清空、键盘与表单隔离和跨目录分页复用。
mcp-management-page.tsx: 独立 MCP 管理页，基于 coss UI `Tabs`/`Badge`/`Button`/`Checkbox`/`Field`/`Fieldset`/`Input`/`Select`/`Alert` 管理服务配置与访问授权，默认筛选启用项；支持固定公共 headers 增删改、API Key Header 配置与 OAuth URL HTTP(S) 校验，用户秘密留在端侧。
mcp-management-page.test.tsx: 验证 MCP Tab/搜索隔离、创建/授权弹窗、四类认证配置编辑时的原值保留、HTTP OAuth 创建和默认 Resource、非法协议提示与无写入、固定 Header 校验与 revision 请求等完整门禁。
plugins-workspace-page.tsx: `/plugins` 插件版本工作台薄壳，MCP 使用独立一级菜单。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
