# bundle/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 企业组合包发布说明，定义模型覆盖、受管插件、Session 同步、中心直连与 rc.7 peer 边界。
package.json: `dsh.bundle`/`dsh.client` 双清单，精确 LLM/Session/Persistence/subprocess/inventory peers 与 Client 图。
tsconfig.json: bundle Host 公开声明的 emit-only TypeScript 边界，通过 workspace package 声明消费产品模块且不映射 Harness 源码。
cordis.patch.yml: 官方 profile layer，覆盖企业 default、停用个人 provider/模型设置并插入企业 Host/Client row。
scripts/build.mjs: 内联产品模块但 externalize 官方 Cordis/LLM/Session/Persistence/Schemastery 单例的双端构建器。
src/index.ts: bundle Host 组合入口，挂载平台、Session 同步、模型与插件分发 Service，并集中 Schemastery Config。
tests/bundle.spec.ts: 模型/分发/Session inject、精确 peers、Client graph、构建产物与无 Typert 越界验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
