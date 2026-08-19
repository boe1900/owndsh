# session-sync/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: Session 客户端边界说明，定义本地优先复制、无正文游标、终态/退避、完整验证后恢复与 tombstone 删除。
package.json: 私有 workspace package 清单，精确声明官方 rc.7 Session/Persistence/Cordis peers 与产品协议依赖。
tsconfig.json: Node TypeScript 构建边界，从 `src/` 生成 ESM 与声明。
src/errors.ts: 将平台、网络和协议失败归一为稳定 retryable/terminal SessionSyncError。
src/index.ts: 汇总 Service、协议、cursor store、恢复事务与公开类型的 package facade。
src/protocol.ts: 实现 format v0 header 投影、精确 JSONL/SHA-256/rolling hash、双边界切批和远端页验证。
src/restore.ts: 通过官方 SessionId/create/flush 创建带 parentSession/seedLength 的新 ID 耐久副本。
src/service.ts: 拥有 dirty queue、2 秒防抖、逐 Session 单 worker、断点/退避、远端列表、全量验证后恢复和停稳式删除。
src/state-store.ts: 严格读写 `$DSH_HOME/enterprise/session-sync.json`，以 0600 临时文件加 rename 提交无正文游标。
src/types.ts: 定义同步 Config、cursor/status、恢复/删除 DTO 与官方 Service 组合 Context。
tests/protocol.spec.ts: 验证精确行字节、事件数/字节切批、header v0、hash 链和篡改拒绝。
tests/restore.spec.ts: 以真实 Session seed 校验器验证成功恢复、输入拒绝和 create 失败不触发 flush。
tests/service.spec.ts: 验证非阻塞 append、flush/readFrom、单 worker、断点、退避终态、首传前删除竞态和坏页零创建。
tests/state-store.spec.ts: 验证 0600、稳定排序、严格 schema、正文拒绝和临时文件清理。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
