# components/

> L2 | 父级: ../CLAUDE.md

成员清单

auth.yaml: T05 固定 public client、PKCE、登录事务、公开身份源、LOCAL 条件验证码、Token 与 logout schema 分片。
device.yaml: T05 enroll/heartbeat、设备详情、管理员 cursor list 与 revoke schema 分片。
identity.yaml: T04 身份治理 schema 分片，定义 OIDC/LDAP 配置、身份源、cursor page、组映射和删除确认，并复用根协议公共组件。
model.yaml: T08 provider/model/grant 管理、writeOnly credential、脱敏 probe 和完整 bootstrap 外壳 schema 分片。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
