# routes/

> L2 | 父级: ../CLAUDE.md

成员清单

__root.tsx: 产品 pathless layout 与 examples 共享的无视觉根出口。
_console.tsx: 不改变 URL 的产品布局边界，挂载 ConsoleShell。
_console.index.tsx: 根路径模型空状态，P2-04 接入真实模型查询。
_console.access.tsx: 访问策略静态入口，P2-04 接入授权与限额事实。
_console.activity.tsx: 活动记录静态入口，P2-07 接入用量、审计与 Session 事实。
_console.members.tsx: 成员静态入口，P2-06 接入成员与多身份事实。
_console.plugins.tsx: 插件静态入口，P2-05 接入发布、分配与设备状态。
_console.settings.tsx: 设置静态入口，P2-07 接入身份源、系统信息与服务健康。
examples.tsx: `/examples` 的独立父出口，不挂载企业产品壳。
examples.index.tsx: 运行全部上游组件 demo 并展示同源源码。
examples.harness.tsx: 运行完整 Ice Cream Harness 交互基线。
-models-index-page.tsx: 模型根路径的可测试空状态页面，前缀阻止路由生成器误收非路由源码。
-section-page.tsx: 业务纵向任务接入前共享的平面标题与空状态布局，不拥有领域数据。
-index.test.tsx: 产品壳、工作区菜单、按钮导航与静态路由的最小集成门禁，前缀阻止路由生成器误收测试文件。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
