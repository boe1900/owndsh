# components/

> L2 | 父级: ../CLAUDE.md

成员清单

auth.yaml: 固定 public client、PKCE、登录事务、公开身份源、LOCAL 首次改密/条件验证码、Token 与 logout schema 分片。
device.yaml: T05 enroll/heartbeat、设备详情、管理员 cursor list 与 revoke schema 分片。
identity.yaml: T04 身份治理 schema 分片，定义 OIDC/LDAP 配置、身份源、cursor page、组映射和删除确认，并复用根协议公共组件。
model.yaml: T08 provider/model/grant 管理、writeOnly credential、脱敏 probe 和引用 T13 插件分配的完整 bootstrap 外壳 schema 分片。
quota.yaml: T09 quota policy/window、bootstrap quota、本人计数和 prompt-free ledger schema 分片。
gateway.yaml: OpenAI-compatible 严格流式请求、thinking/effort、纯文本 message/function tool 与 chunk/usage schema 分片。
plugin.yaml: compatibility、版本状态、catalog 完整 assignment 集合、runtime 下载事实和设备库存 schema 分片。
session.yaml: 官方 rc.7 format v0 header、精确 JSONL/hash、本人/admin metadata、正文页、tombstone 与恢复审计 schema 分片。
audit.yaml: T19 30-action 枚举、封闭 metadata DTO 联合与只读 cursor page schema。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
