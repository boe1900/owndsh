# components/

> L2 | 父级: ../CLAUDE.md

成员清单

auth.yaml: 固定 public client、PKCE、登录事务、公开身份源、LOCAL 改密、Desktop code/refresh grants、管理端 Cookie exchange、logout 与无菜单 bootstrap schema 分片。
device.yaml: T05 enroll/heartbeat、设备详情、管理员 cursor list 与 revoke schema 分片。
identity.yaml: 身份治理 schema 分片，定义 OIDC/LDAP、目录发现/单人导入、JIT/LINK_ONLY、扁平产品用户组、外部组映射和删除确认，并复用根协议公共组件。
member.yaml: LOCAL 成员创建、产品成员 cursor/detail、固定角色、脱敏登录方式、设备/Session 摘要、状态/角色写入及一次性身份绑定 schema，不投影部门、岗位或原始 claims。
model.yaml: T08/P2-08A Harness providerKey/type/apiProtocol、reasoningEfforts 三态/compat、model/model set/grant 管理、writeOnly credential、脱敏模型发现与完整 bootstrap schema 分片。
quota.yaml: T09/P2-08A TOKEN/RATE 互斥策略、组织/成员与多模型范围、组织级供应商 RATE、四类窗口、bootstrap quota、本人计数和 prompt-free ledger schema 分片。
gateway.yaml: 三协议共用的最小流式治理字段 schema，消息、工具、推理与回放保持原生透传。
plugin.yaml: compatibility、版本状态、catalog 完整 assignment 集合、runtime 下载事实和设备库存 schema 分片。
session.yaml: 官方 rc.7 format v0 header、精确 JSONL/hash、本人/admin metadata、正文页、tombstone 与恢复审计 schema 分片。
audit.yaml: 31-action 枚举、封闭 metadata DTO 联合与只读 cursor page schema。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
