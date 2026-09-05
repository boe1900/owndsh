# plugin-distribution/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 受管插件客户端下载、双重校验、CLI 调和、重启确认、可选信任根与整包卸载边界。
package.json: 私有 workspace package 清单，声明兼容 Harness subprocess/inventory peer 与可打包产品依赖。
tsconfig.json: Node TypeScript 构建边界，从 `src/` 生成 ESM、声明与 sourcemap。
src/cli.ts: Web 走官方 `ctx.subprocess`、Desktop 走公开 command port 的单一 argv 边界，显式透传 DSH_HOME 并限制诊断输出。
src/errors.ts: 本地稳定分发错误码，状态文件和库存只持久化 code 而不保存中心正文。
src/index.ts: package facade、Cordis Context 合并与公开类型出口。
src/service.ts: Cordis shadow-compatible 的串行 revision 调和，统一等待新旧 Harness 同步/异步库存，状态读取 fatal 后丢弃 pending 防止 Host 自旋，拥有缺失信任根 fail-closed、核心保护、重启确认与整包卸载。
src/state-store.ts: `managed-plugins.json` 严格解析与私有权限原子替换边界。
src/types.ts: 平台、subprocess、同步或异步 Loader inventory 窄 port 及可选安装信任根/已验证 Harness commit/受管状态契约。
src/verification.ts: 流式下载、大小/hash、RFC 8785 受限声明、Ed25519 与已知 commit fail-closed compatibility 校验。
tests/service.spec.ts: 假平台与 Cordis caller proxy 覆盖 Web/Desktop 命令口、新版异步库存的调和/上报/卸载、状态损坏停稳、安装、无信任根拒绝、重启 active、ABSENT、回滚与核心保护。
tests/verification.spec.ts: 下载中断、hash、签名、已知/未知 Harness compatibility、缓存制品、UTF-16 键序与 JCS 同源向量测试。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
