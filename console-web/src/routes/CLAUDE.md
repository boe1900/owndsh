# routes/

> L2 | 父级: ../CLAUDE.md

成员清单

__root.tsx: 全部静态产品路由的根边界，在此挂载直接派生自 Harness 的 ConsoleShell。
index.tsx: 根路径模型空状态，P2-04 接入真实模型查询。
access.tsx: 访问策略静态入口，P2-04 接入授权与限额事实。
activity.tsx: 活动记录静态入口，P2-07 接入用量、审计与 Session 事实。
members.tsx: 成员静态入口，P2-06 接入成员与多身份事实。
plugins.tsx: 插件静态入口，P2-05 接入发布、分配与设备状态。
settings.tsx: 设置静态入口，P2-07 接入身份源、系统信息与服务健康。
-models-index-page.tsx: 模型根路径的可测试空状态页面，前缀阻止路由生成器误收非路由源码。
-section-page.tsx: 业务纵向任务接入前共享的平面标题与空状态布局，不拥有领域数据。
-index.test.tsx: 产品壳、导航与静态路由的最小集成门禁，前缀阻止路由生成器误收测试文件。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
