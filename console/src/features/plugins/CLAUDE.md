# plugins/

> L2 | 父级: ../CLAUDE.md

成员清单

plugin-management-page.tsx: 通过生成 JSON API、Query 与产品表格管理安装地址/分类、版本发布、ALL/USER 可见范围和设备状态；登记弹窗复用目录分页完整收集已有分类。
plugin-management-page.test.ts: 验证默认精确 npm 目标、Git 固定 commit、源码地址分离和分类规范化。
plugin-editors.tsx: 安装配置与可见范围表单，分类通过受控数组收集多选/自定义标签并原样提交；依赖和私有源认证归宿主，范围只可自选安装或显式撤回。
plugin-category-select.tsx: 采用 shadcn Combobox 同源 Base UI 多选原语，组合已有/常用分类、搜索、新名称创建和可删除标签，遵守 12 项/40 字符边界并隔离 Enter/Escape 与外层表单。
plugin-category-select.test.tsx: 验证分类选择、创建、去重、删除、键盘与表单隔离、数量上限和跨目录分页复用。
mcp-management-page.tsx: 独立 MCP 管理页，标题右侧切换服务配置/访问授权，复用产品表格与弹窗、模型页编辑/启停图标；编辑回填认证参数并以 If-Match 保存，OAuth URL 接受 HTTP(S) 并按字段拒绝其他协议、userinfo 和片段，HTTP MCP 地址自动带出 allowInsecureTransport，支持固定公共 headers 的增删改与冲突校验，API Key 仅配置 Header 名称并要求用户原样填写完整认证值，用户秘密留在端侧。
mcp-management-page.test.tsx: 验证 MCP Tab/搜索隔离、创建/授权弹窗、四类认证配置编辑时的原值保留、HTTP OAuth 创建和默认 Resource、非法协议提示与无写入、固定 Header 创建/修改/移除与重复/认证冲突校验、revision 请求、冲突保留草稿、只读权限和 null 数据错误恢复。
plugins-workspace-page.tsx: `/plugins` 插件版本工作台薄壳，MCP 使用独立一级菜单。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
