# plugin-distribution/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 受管插件客户端下载、双重校验、CLI 调和、重启确认与核心保护边界。
package.json: 私有 workspace package 清单，固定 rc.2 subprocess/inventory peer 与可打包产品依赖。
tsconfig.json: Node TypeScript 构建边界，从 `src/` 生成 ESM、声明与 sourcemap。
src/cli.ts: Web 走官方 `ctx.subprocess`、Desktop 走公开 command port 的单一 argv 边界，显式透传 DSH_HOME 并限制诊断输出。
src/errors.ts: 本地稳定分发错误码，状态文件和库存只持久化 code 而不保存中心正文。
src/index.ts: package facade、Cordis Context 合并与公开类型出口。
src/service.ts: Cordis shadow-compatible 的串行 revision 调和、核心保护、重启确认、库存替换和生命周期所有者。
src/state-store.ts: `managed-plugins.json` 严格解析与私有权限原子替换边界。
src/types.ts: 平台、subprocess、Loader inventory 窄 port 及受管状态契约。
src/verification.ts: 流式下载、大小/hash、RFC 8785 受限声明、Ed25519 与 compatibility 校验。
tests/service.spec.ts: 假平台与 Cordis caller proxy 覆盖 Web/Desktop 命令口、安装、失败不激活、重启 active、ABSENT、回滚与核心拒绝。
tests/verification.spec.ts: 下载中断、hash、签名、compatibility、缓存制品、UTF-16 键序与 JCS 同源向量测试。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
