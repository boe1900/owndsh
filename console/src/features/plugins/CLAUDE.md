# plugins/

> L2 | 父级: ../CLAUDE.md

成员清单

plugin-management-page.tsx: 通过生成的插件/成员 operation、原生 multipart JSON part、TanStack Query 与产品表格呈现版本、ALL/USER 分配和设备状态，并管理上传、发布、退休与 package revision 原子分配；服务端独占验包、签名和状态裁决。
plugin-management-page.test.ts: 验证上传保持 tgz File，并以 application/json Blob 发送 compatibility，锁住 Spring RequestPart 契约。
plugin-editors.tsx: 使用浏览器原生控件收集 tgz、Desktop/Harness 兼容性和 ALL/USER 分配，以共享成员目录阻止手填 ID，并提供退休确认边界。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
