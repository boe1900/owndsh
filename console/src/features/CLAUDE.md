# features/

> L2 | 父级: ../CLAUDE.md

成员清单

member-select.tsx: 通过生成的成员目录 operation 自动遍历 cursor，以 Query 缓存复用显示名/账号并向策略表单只返回稳定 Member ID。
account-page.tsx: 采用 shadcn Settings 信息架构提供基本信息与安全设置独立子页面，展示当前账号、角色、多登录来源，并在本人改密撤销全部 Cookie 会话后返回登录页。
access/: 模型访问、组织/成员 TOKEN/RATE 互斥策略的分表列表与管理表单；局部地图见 access/CLAUDE.md。
activity/: 按 console 权限读取用量和审计，V1 不读取或展示 Session；局部地图见 activity/CLAUDE.md。
workspace/: Console 本人设备侧栏分组与独立原生 DSH document 的身份/状态、本人 Cookie 授权、共享加密 carrier 与冻结官方 UI 装配；局部地图见 workspace/CLAUDE.md。
remote/: 管理端 Remote 设备列表、短期 ticket、connection state machine 与诊断面板；P0 不承载 Session/File/Terminal 页面。
members/: 产品成员、扁平用户组、OIDC/LDAP/LOCAL 身份接入、LDAP 单人导入/组映射与身份/角色治理；局部地图见 members/CLAUDE.md。
models/: Provider 与受管模型目录、三协议配置、模型发现和 Harness 能力声明管理；局部地图见 models/CLAUDE.md。
plugins/: 插件版本、发布状态与可见范围管理，以及独立 `/mcp` 页的服务配置/访问授权；局部地图见 plugins/CLAUDE.md。
skills/: skill release 导入、发布/撤销目录工作台；员工端按需安装，局部地图见 skills/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
