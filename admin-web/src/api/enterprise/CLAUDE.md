# enterprise/

> L2 | 父级: ../../../CLAUDE.md

成员清单

auth/: enterprise-admin PKCE、token exchange 与 logout 边界；局部地图见 auth/CLAUDE.md。
device/: 设备 cursor 查询、详情与 revision CAS 撤销业务 API。
generated-request.ts: Umi OpenAPI 生成调用到统一 Axios 管理会话/错误边界的适配器，并剥离 multipart requestType 元数据。
identity/: 身份源和外部组映射业务 API，集中幂等与 revision header。
model/: provider 和受管模型业务 API，密钥只允许一次性创建或替换。
mutation.ts: 创建幂等键和 If-Match revision 请求头唯一构造入口。
plugin/: 插件 catalog、版本状态、全量分配和设备 inventory 业务 API；局部地图见 plugin/CLAUDE.md。
quota/: 模型授权、配额策略、窗口和 prompt-free 用量业务 API。
session/: Session metadata、受权限保护正文的严格 JSONL 解码与 tombstone 删除业务 API。
audit/: 审计 cursor 查询与 action 对应 metadata key/标量双重校验业务 API；局部地图见 audit/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
