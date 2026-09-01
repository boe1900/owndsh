# settings/

> L2 | 父级: ../CLAUDE.md

成员清单

settings-page.tsx: 通过生成 operation 管理身份源连接测试和状态，以 bootstrap 呈现最小部署信息，并直接复用 deploy 同源 `/healthz` 健康事实。
settings-page.test.tsx: 锁定健康失败的局部错误与显式重试，避免服务状态拖垮整个设置页。
identity-source-editor.tsx: 收集 OIDC/LDAP 配置与 LOCAL 名称，创建强制一次性 secret、更新留空不序列化 secret，且不恢复外部组到部门映射。
identity-source-editor.test.ts: 锁定创建、更新和 LOCAL provisioning mode 的 secret 隔离语义。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
