# features/

> L2 | 父级: ../CLAUDE.md

成员清单

member-select.tsx: 通过生成的成员目录 operation 自动遍历 cursor，以 Query 缓存复用显示名/账号并向策略表单只返回稳定 Member ID。
account-page.tsx: 基于原生 coss UI `Dialog`/`Tabs`/`ScrollArea`/`Button`/`Avatar`/`Badge`/`Field`/`Input`/`Alert` 提供左右分栏弹窗版用户中心 `AccountDialog`（760×560 比例、左 208px 纵向标签导航与右侧独立滚动内容，严格承载真实基本信息与改密表单），同时保留面向无管理页员工兜底的 `/account` 子页面与本人改密撤销全部 Cookie 会话流程。
access/: 模型访问、组织/成员 TOKEN/RATE 互斥策略的分表列表与管理表单；局部地图见 access/CLAUDE.md。
activity/: 按 console 权限读取用量和审计，V1 不读取或展示 Session；局部地图见 activity/CLAUDE.md。
workspace/: Console 本人设备侧栏分组与独立原生 DSH document 的身份/状态、本人 Cookie 授权、共享加密 carrier 与冻结官方 UI 装配；局部地图见 workspace/CLAUDE.md。
members/: 产品成员、扁平用户组、OIDC/LDAP/LOCAL 身份接入、LDAP 单人导入/组映射与身份/角色治理；局部地图见 members/CLAUDE.md。
models/: Provider 与受管模型目录、三协议配置、模型发现和 Harness 能力声明管理；局部地图见 models/CLAUDE.md。
plugins/: 插件版本、发布状态与可见范围管理，以及独立 `/mcp` 页的服务配置/访问授权；局部地图见 plugins/CLAUDE.md。
skills/: skill release 导入、发布/撤销目录工作台；员工端按需安装，局部地图见 skills/CLAUDE.md。
usage/: 全角色共用的「个人 -> 用量」用量页，从本人统计接口读取日期范围内的实测汇总、分布、趋势和分页明细；局部地图见 usage/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
