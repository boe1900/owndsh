# product/

> L2 | 父级: ../CLAUDE.md

成员清单

DataTable.tsx: coss UI (`Frame`/`Table variant="card"`/`FrameFooter`/`Pagination`/`InputGroup`/`Select`/`Menu`/`Checkbox`/`Button`/`Badge`/`Spinner`/`Alert`) 与 TanStack Table v9 组合的产品数据表及共享单元格原语（`TableStatusBadge`/`TableStackCell`），将顶部搜索筛选栏与按需多选批量栏拆出在 Frame 外部，Frame 内部固定列宽预算（`table-fixed` + 按可见列累加 `minWidth`）并支持视口自适应限高、表头吸顶（滚动出现底分割线，翻页自动回顶）与底部分页器固定；仅在传入 `selectionActions` 或 `selectable` 时渲染复选框列，并在筛选或数据变更时自动剪除不可见/已消失的选中行。
DataTable.test.tsx: 共享表格的业务默认筛选、搜索、精确筛选、行选择、列显隐、分页、滚动吸顶状态、翻页回顶与固定列宽预算门禁。
Dialog.tsx: 基于 coss UI `Dialog`/`DialogPopup`/`DialogHeader`/`DialogTitle`/`DialogDescription` 的可访问模态容器，统一标题、可选副标题、关闭动作与高度边界。
DialogFooter.tsx: 基于 coss `DialogFooter` 的弹窗表单底部操作栏，保留 `sticky` 与普通 flex 兄弟两种布局协议。
ConfirmDialog.tsx: 基于 coss UI 原生 `AlertDialog`（`AlertDialogPopup`/`AlertDialogHeader`/`AlertDialogTitle`/`AlertDialogDescription`/`AlertDialogFooter`/`AlertDialogClose`）与 `Alert`/`Button` 的共享危险/状态确认弹窗，统一取消/确认、错误保留、处理中锁止关闭与次级提示说明。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
