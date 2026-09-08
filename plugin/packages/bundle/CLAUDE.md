# bundle/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: npm 员工用户入口，说明 `next` 安装、Server 登录、Host 凭据持久化、更新卸载、兼容基线与受管插件信任根。
package.json: npm `next` 发布清单与 `dsh.bundle`/`dsh.client` 双入口，声明 Harness 0.1.1-rc.2 与 0.1.2-rc.1 两条预发行兼容范围；Client 只声明三个所用 slot 的所有者，避免依赖新版已退役的 client-runtime row。
screenshots.json: 社区市场从插件源码目录读取的四张原始截图清单，通过 GitHub 固定提交 URL 复用 docs/assets 媒体并控制展示顺序，不改变 npm 运行包。
tsconfig.json: bundle Host 公开声明的 emit-only TypeScript 边界，通过 workspace 声明消费产品模块，并局部跳过链接上游损坏声明检查。
cordis.patch.yml: 官方 profile layer，覆盖企业 default、停用个人 provider/模型设置并插入企业 Host/Client row。
scripts/build.mjs: 内联产品模块但 externalize 官方 Cordis/credentials/LLM/settings/Schemastery 与 Client ui-primitives 单例的双端构建器。
src/index.ts: Web/Desktop 共用 Host 组合入口，绑定官方 credentials、pi-ai、企业目录及手动安装/卸载，识别 rc.2 与 0.1.2-rc.1 官方 commit；平台经注入端口消费分发，保持依赖单向。
tests/bundle.spec.ts: credentials/模型/分发/卸载组合、V1 Session 停用、兼容 peers、运行时版本来源、Client graph 与构建产物验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
