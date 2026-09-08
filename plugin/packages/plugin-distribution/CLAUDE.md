# plugin-distribution/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 受管插件客户端下载、双重校验、CLI 调和、重启确认、可选信任根与整包卸载边界。
package.json: 私有 workspace package 清单，声明兼容 Harness subprocess/inventory peer 与可打包产品依赖。
tsconfig.json: Node TypeScript 构建边界，从 `src/` 生成 ESM、声明与 sourcemap。
src/cli.ts: Web 走官方 `ctx.subprocess`、Desktop 走公开 command port 的单一 argv 边界，显式透传 DSH_HOME 并限制诊断输出。
src/errors.ts: 本地稳定分发错误码，状态文件和库存只持久化 code 而不保存中心正文。
src/index.ts: package facade、Cordis Context 合并与公开类型出口。
src/service.ts: 企业可选目录与手动安装/版本切换/卸载的串行所有者，点击时重查授权且绑定版本，revision 仅确认库存与显式撤回；复用签名/兼容性阻断、核心保护和重启确认。
src/state-store.ts: `managed-plugins.json` 严格解析与私有权限原子替换边界。
src/types.ts: 平台、subprocess、同步或异步 Loader inventory 窄 port，以及分离企业目录与本机安装事实的状态契约、可选信任根与已验证 Harness commit。
src/verification.ts: 流式下载、大小/hash、RFC 8785 受限声明、Ed25519 与已知 commit fail-closed compatibility 校验。
tests/service.spec.ts: 覆盖发布/轮询/重启零自动安装、显式更新/卸载耐久、缓存重授权、过期版本拒绝、串行互斥、签名/核心保护与 Web/Desktop Loader 确认。
tests/verification.spec.ts: 下载中断、hash、签名、已知/未知 Harness compatibility、缓存制品、UTF-16 键序与 JCS 同源向量测试。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
