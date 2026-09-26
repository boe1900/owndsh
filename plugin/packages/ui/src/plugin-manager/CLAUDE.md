# plugin-manager/
> L2 | 父级: ../CLAUDE.md

成员清单

PluginManagerPage.tsx: 官方 RC1 插件管理页 fork；保留卡片、详情、配置槽位与生命周期，只把头部按钮绑定到 OwnDsh 市场。
manager-store.ts: 官方 pluginManager Remote 状态机，保留任意包安装、检查、日志、启停、卸载与失败恢复。
index.ts: 注册官方插件主面板与侧栏入口，并注入 OwnDsh 市场打开回调。
config-ledger.ts: 将官方配置槽位投影为页面可读账本。
slot-contract.ts: 声明官方插件详情与配置扩展槽位。
PluginsPanelIcon.tsx: 官方侧栏图标。
locales.ts: 官方页面中英文文案，含“插件市场”按钮文案。
presentation.ts: 官方页面展示文本解析。
PluginManagerPage.module.css: 官方页面布局与状态样式。

法则: 源码基线为 `deepseek-harness` 的 `dsh-v0.1.7-rc.1`（提交 `a60af51e80`）；只允许在添加按钮节点接入 OwnDsh 市场，后续升级按官方提交同步后重放该单点修改。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
