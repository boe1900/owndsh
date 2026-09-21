# plugins/

> L2 | 父级: ../CLAUDE.md

成员清单

plugin-management-page.tsx: 通过生成 JSON API、Query 与产品表格管理插件版本/范围/设备；每行可基于已有版本新增，保存后刷新目录并衔接该旧版的发布确认，提交版本及包双 revision，失败保留草稿并刷新列表；目录分页收集完整分类。
plugin-management-page.test.tsx: 验证新增版本的包身份锁定/资料继承、npm 自动目标、Git commit、重复版本、保存后发布、双 revision 范围迁移、失败/冲突草稿保留和只读权限。
plugin-editors.tsx: 首次登记与新增版本共用表单，新增时沿用资料并折叠、锁定包名；安装方式先选 npm/Git/tgz/客户端路径，npm 目标随包名和版本自动生成，其他来源显示对应格式说明，Git 必须更换 commit；发布明确选择沿用某旧版 ACTIVE/INSTALLED 范围或仅发布，携带已查看的包 revision；分类多选/自定义、范围编辑与退休沿用现有组件。
plugin-category-select.tsx: 采用 shadcn Combobox 同源 Base UI 多选原语，组合已有/常用分类、搜索、新名称创建和可删除标签，遵守 12 项/40 字符边界并隔离 Enter/Escape 与外层表单。
plugin-category-select.test.tsx: 验证分类选择、创建、去重、删除、键盘与表单隔离、数量上限和跨目录分页复用。
mcp-management-page.tsx: 独立 MCP 管理页，标题右侧切换服务配置/访问授权，复用产品表格与弹窗、模型页编辑/启停图标；编辑回填认证参数并以 If-Match 保存，OAuth URL 接受 HTTP(S) 并按字段拒绝其他协议、userinfo 和片段，HTTP MCP 地址自动带出 allowInsecureTransport，支持固定公共 headers 的增删改与冲突校验，API Key 仅配置 Header 名称并要求用户原样填写完整认证值，用户秘密留在端侧。
mcp-management-page.test.tsx: 验证 MCP Tab/搜索隔离、创建/授权弹窗、四类认证配置编辑时的原值保留、HTTP OAuth 创建和默认 Resource、非法协议提示与无写入、固定 Header 创建/修改/移除与重复/认证冲突校验、revision 请求、冲突保留草稿、只读权限和 null 数据错误恢复。
plugins-workspace-page.tsx: `/plugins` 插件版本工作台薄壳，MCP 使用独立一级菜单。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
