# product/

> L2 | 父级: ../CLAUDE.md

成员清单

DataTable.tsx: Beautiful UI 视觉下的 TanStack Table v9 产品数据表，统一搜索、筛选（支持业务显式默认值）、排序、列显隐、行选择、本地分页、Server cursor 续页和业务批量操作插槽；提供统一工具栏筛选插槽与可选列设置入口，页面只注入内容不重写表格结构。
DataTable.test.tsx: 共享表格的业务默认筛选、搜索、精确筛选、行选择、列显隐与分页行为门禁。
Dialog.tsx: 产品表单共享的可访问模态容器，统一遮罩、标题、可选副标题、关闭动作与移动端高度边界。
DialogFooter.tsx: 弹窗表单共享的全宽底部操作栏，统一分割线、右对齐按钮、间距与高度；内容滚动时固定在视口底部。
ConfirmDialog.tsx: 共享副作用确认弹窗，统一取消/确认、错误和提交中状态，业务页只提供操作语义。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
