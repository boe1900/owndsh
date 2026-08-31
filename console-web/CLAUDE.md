# console-web/

> L2 | 父级: ../CLAUDE.md

成员清单

package.json: 独立产品控制台依赖与命令真源，固定 Node 24、pnpm 11、React 19、Vite 8、TanStack Router/Query 和 Hey API。
pnpm-lock.yaml: pnpm 11 解析出的精确依赖锁，保证私有部署与 CI 使用同一供应链图。
pnpm-workspace.yaml: 单项目 pnpm 安全边界，只允许构建 Vite 依赖的 esbuild。
tsconfig.json: 浏览器 TypeScript 6 严格配置，启用 Bundler resolution 与 no unchecked index，并兼容生成源码和上游声明。
vite.config.ts: Vite、TanStack 文件路由、React、Vitest 与 62209 本地开发端口配置。
index.html: 控制台唯一 HTML 入口，只挂载 React root。
README.md: 本地安装、检查、启动与 OpenAPI 生成物边界。
scripts/: OpenAPI 派生脚本；局部地图见 scripts/CLAUDE.md。
src/: 浏览器应用、路由、样式与生成 API；局部地图见 src/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
