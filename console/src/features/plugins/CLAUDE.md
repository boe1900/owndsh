# plugins/

> L2 | 父级: ../CLAUDE.md

成员清单

plugin-management-page.tsx: 通过生成 API、multipart JSON part、Query 与产品表格管理企业版本、ALL/USER 可见范围和设备库存；上传/发布不触发安装，服务端独占验包、签名与范围裁决。
plugin-management-page.test.ts: 验证上传保持 tgz File，并以 application/json Blob 发送 compatibility，锁住 Spring RequestPart 契约。
plugin-editors.tsx: 原生 tgz/兼容性与可见范围表单，默认覆盖官方 rc.2/0.1.2-rc.1 commit；范围只可自选安装或显式撤回，固定 required=false，不提供强制安装。
mcp-management-page.tsx: 独立 MCP 管理页，标题右侧切换服务配置/访问授权，复用产品表格与弹窗、模型页编辑/启停图标；编辑回填认证参数并以 If-Match 保存，支持固定公共 headers 的增删改与冲突校验，API Key 仅配置 Header 名称并要求用户原样填写完整认证值，保留既有连接参数，用户秘密留在端侧。
mcp-management-page.test.tsx: 验证 MCP Tab/搜索隔离、创建/授权弹窗、四类认证配置编辑时的原值保留、固定 Header 创建/修改/移除与重复/认证冲突校验、revision 请求、冲突保留草稿、只读权限和 null 数据错误恢复。
plugins-workspace-page.tsx: `/plugins` 插件版本工作台薄壳，MCP 使用独立一级菜单。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
