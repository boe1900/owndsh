# plugins/

> L2 | 父级: ../CLAUDE.md

成员清单

plugin-management-page.tsx: 通过生成 API、multipart JSON part、Query 与产品表格管理企业版本、ALL/USER 可见范围和设备库存；上传/发布不触发安装，服务端独占验包、签名与范围裁决。
plugin-management-page.test.ts: 验证上传保持 tgz File，并以 application/json Blob 发送 compatibility，锁住 Spring RequestPart 契约。
plugin-editors.tsx: 原生 tgz/兼容性与可见范围表单，默认覆盖官方 rc.2/0.1.2-rc.1 commit；范围只可自选安装或显式撤回，固定 required=false，不提供强制安装。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
