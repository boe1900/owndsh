# console/

> L2 | 父级: ../CLAUDE.md

成员清单

package.json: 独立产品控制台依赖与命令真源，固定 Node 24、pnpm 11、React 19、Vite 8、TanStack Router/Query/Table/Form、Zod、Hey API 及 Beautiful UI 所需 Tailwind/Inter/shadow-plugin，免费图标统一使用 Lucide。
pnpm-lock.yaml: pnpm 11 解析出的精确依赖锁，保证私有部署与 CI 使用同一供应链图。
pnpm-workspace.yaml: 单项目 pnpm 安全边界，只允许构建 Vite 依赖的 esbuild。
tsconfig.json: 浏览器 TypeScript 6 严格配置，启用 Bundler resolution 与 `@/` 源码路径；数组索引检查遵循锁定上游组件语义。
vite.config.ts: Vite、TanStack 文件路由、React、Tailwind、Vitest、62209 本地端口与默认指向 62207 OwnDsh TLS 入口的 `/enterprise`、`/healthz` 开发代理。
index.html: 控制台唯一 HTML 入口，在挂载 React 前恢复 Beautiful UI 主题以避免首帧闪烁。
README.md: 本地安装、检查、启动、Beautiful UI 来源与 OpenAPI 生成物边界。
BEAUTIFUL_UI_LICENSE: 直接派生的 Beautiful UI Harness/foundation/primitive 源码所附 MIT 许可证。
public/: 控制台品牌候选与组件示例静态资源；局部地图见 public/CLAUDE.md。
scripts/: OpenAPI 派生脚本；局部地图见 scripts/CLAUDE.md。
src/: 浏览器应用、认证、静态角色路由、样式与生成 API；局部地图见 src/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
