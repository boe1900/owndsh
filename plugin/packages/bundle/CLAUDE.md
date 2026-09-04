# bundle/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: npm 员工用户入口，说明 `next` 安装、Server 登录、Host 凭据持久化、更新卸载、兼容基线与受管插件信任根。
package.json: npm `next` 发布清单与 `dsh.bundle`/`dsh.client` 双入口，声明 Harness 官方 caret-compatible peers、精确 rc.2 构建依赖及官方 Client 图，不装载 Session 运行依赖。
tsconfig.json: bundle Host 公开声明的 emit-only TypeScript 边界，通过 workspace 声明消费产品模块，并局部跳过链接上游损坏声明检查。
cordis.patch.yml: 官方 profile layer，覆盖企业 default、停用个人 provider/模型设置并插入企业 Host/Client row。
scripts/build.mjs: 内联产品模块但 externalize 官方 Cordis/credentials/LLM/settings/Schemastery 单例的双端构建器。
src/index.ts: Web/Desktop 共用 Host 组合入口，注入官方 credentials，挂载可配置平台、pi-ai profile 桥与整包卸载，并投影真实版本。
tests/bundle.spec.ts: credentials/模型/分发/卸载组合、V1 Session 停用、兼容 peers、运行时版本来源、Client graph 与构建产物验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
