# plugin-distribution/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 受管插件默认免公钥安装、可选验签、HTTP 内网信任边界、CLI 调和与整包卸载说明。
package.json: 私有 workspace package 清单，声明兼容 Harness subprocess/inventory peer 与可打包产品依赖。
tsconfig.json: Node TypeScript 构建边界，从 `src/` 生成 ESM、声明与 sourcemap。
src/cli.ts: Web 走官方 `ctx.subprocess`、Desktop 走公开 command port 的单一 argv 边界，显式透传 DSH_HOME 并限制诊断输出。
src/errors.ts: 本地稳定分发错误码，状态文件和库存只持久化 code 而不保存中心正文。
src/index.ts: package facade、Cordis Context 合并与公开类型出口。
src/service.ts: 企业目录与手动安装/卸载的串行所有者，目录和安装共用安装层验签策略，默认不读取公钥；点击时重查授权且绑定版本，保留兼容性、核心保护和重启确认。
src/state-store.ts: `managed-plugins.json` 严格解析与私有权限原子替换边界。
src/types.ts: 平台与官方运行时窄 port、企业目录/本机状态契约，以及默认关闭的 verifyPluginSignatures、可选公钥与已验证 Harness commit。
src/verification.ts: 下载与缓存强制校验大小/hash/兼容性，仅显式开启时执行 Ed25519；缺公钥或验签失败阻断，复用 RFC 8785 固定签名声明。
tests/service.spec.ts: 覆盖 HTTP 默认免公钥安装、开启验签后的目录/安装阻断、零自动安装、缓存重授权、核心保护与 Web/Desktop Loader 确认。
tests/verification.spec.ts: 默认免公钥下载与缓存复用、重新开启验签后的缓存拒绝、强制大小/hash/兼容性、中断清理与 JCS 向量测试。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
