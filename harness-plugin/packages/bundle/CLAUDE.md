# bundle/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 企业组合包发布说明，定义模型覆盖、受管插件、中心直连、预构建 tarball 与 rc.7 peer 边界。
package.json: `dsh.bundle`/`dsh.client` 双清单，精确 LLM/subprocess/inventory/Schemastery peer 与 Client 官方注入图。
tsconfig.json: bundle Host 公开声明的 emit-only TypeScript 边界，通过 workspace package 声明消费产品模块且不映射 Harness 源码。
cordis.patch.yml: 官方 profile layer，覆盖企业 default、停用个人 provider/模型设置并插入企业 Host/Client row。
scripts/build.mjs: 内联产品模块但 externalize 官方 Cordis/LLM/Schemastery 单例 peer 的 Host ESM 与 Client 构建器。
src/index.ts: bundle Host 组合入口，挂载平台、模型与插件分发 Service，生产强制 HTTPS 和固定 Ed25519 信任根。
tests/bundle.spec.ts: 模型覆盖、分发 inject/Config、精确 peer、Client graph、构建产物与无 Typert 越界验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
