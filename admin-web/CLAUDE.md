# admin-web/

> L2 | 父级: ../CLAUDE.md

成员清单

.claude/: plus-ui 上游 Claude Code 协作配置，随锁定源码快照保留。
.codex/: plus-ui 上游 Codex 协作配置，随锁定源码快照保留。
.editorconfig: 管理端源码编辑器格式基线。
.env.development: 上游开发环境公开变量默认值，不得写入真实密钥。
.env.production: 上游生产构建公开变量默认值，不得作为部署 secret 载体。
.gitignore: pnpm、Umi/Vite、测试与编辑器产物排除规则。
.oxfmtrc.json: Oxfmt 格式化规则。
.oxlintrc.json: Oxlint 静态检查规则。
LICENSE: plus-ui MIT 许可证原文；锁定 React 快照缺失该文件，按上游历史 blob 与机器锁补齐并随交付物保留。
README.md: plus-ui React 上游项目说明与开发入口。
config/: Umi Max 路由、代理、主题和运行期构建配置。
e2e/: 真实 PostgreSQL/Redis/Server 环境的桌面 Chromium 管理控制台验收与本地外部系统替身。
gen/: RuoYi API 类型与请求客户端生成配置。
package.json: React 19 管理端依赖、脚本和 Node/pnpm 工具链约束真源。
playwright.config.ts: 真实 Server Chromium 串行 E2E、截图和 trace 配置。
pnpm-lock.yaml: plus-ui 锁定依赖图，保证管理端原始构建可复现。
src/: 管理端页面、组件、状态和 API 源码，包含 T12 企业管理纵向功能与生成协议客户端。
tsconfig.json: TypeScript 6 编译边界与路径映射。
vite.config.ts: Vite/Umi 共享的环境读取、alias、依赖预构建、代理与分包配置。
vitest.config.ts: Testing Library/jsdom 快速测试配置，与 Umi 生产构建隔离。

本目录是锁定提交 `29fc02f0a6d5a2462872487524a11c64e956534b` 的源码快照，不含上游 `.git`。企业页面只能消费服务端协议与权限事实，不复制授权算法。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
