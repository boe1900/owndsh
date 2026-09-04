# features/

> L2 | 父级: ../CLAUDE.md

成员清单

member-select.tsx: 通过生成的成员目录 operation 自动遍历 cursor，以 Query 缓存复用显示名/账号并向策略表单只返回稳定 Member ID。
account-page.tsx: 采用 shadcn Settings 信息架构提供基本信息与安全设置独立子页面，展示当前账号、角色、多登录来源，并在本人改密撤销全部 Cookie 会话后返回登录页。
access/: 模型访问、组织/成员 TOKEN/RATE 互斥策略的分表列表与管理表单；局部地图见 access/CLAUDE.md。
activity/: 按 console 权限读取用量、审计和插件关键运行异常，V1 不读取或展示 Session；局部地图见 activity/CLAUDE.md。
members/: 产品成员、扁平用户组、OIDC/LDAP/LOCAL 身份接入、LDAP 单人导入/组映射与身份/角色治理；局部地图见 members/CLAUDE.md。
models/: Provider 与受管模型目录、三协议配置、模型发现和 Harness 能力声明管理；局部地图见 models/CLAUDE.md。
plugins/: 插件版本、发布状态、分配事实和设备库存管理；局部地图见 plugins/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
