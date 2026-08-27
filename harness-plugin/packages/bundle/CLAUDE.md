# bundle/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 企业组合包发布说明，定义官方模型 profile、Host 私有代理、Web/Desktop 受管插件、Session 同步与 rc.2 peer 边界。
package.json: `dsh.bundle`/`dsh.client` 双清单，精确 LLM/Session/Persistence/subprocess/inventory peers 与 Client 图。
tsconfig.json: bundle Host 公开声明的 emit-only TypeScript 边界，通过 workspace 声明消费产品模块，并局部跳过链接上游损坏声明检查。
cordis.patch.yml: 官方 profile layer，覆盖企业 default、停用个人 provider/模型设置并插入企业 Host/Client row。
scripts/build.mjs: 内联产品模块但 externalize 官方 Cordis/LLM/Session/Persistence/Schemastery 单例的双端构建器。
src/index.ts: Web/Desktop 共用 Host 组合入口，挂载平台、Session 同步、官方 pi-ai profile 桥，并按 Desktop services 是否存在选择受管插件命令边界。
tests/bundle.spec.ts: 模型/分发/Session inject、精确 peers、Client graph、构建产物与无 Typert 越界验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
