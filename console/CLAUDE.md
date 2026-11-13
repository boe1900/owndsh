# console/

> L2 | 父级: ../CLAUDE.md

成员清单

package.json: 独立产品控制台依赖与命令真源，要求 Node ≥24.15 以覆盖原生 DSH 构建及 jsdom 测试工具链，使用 pnpm 11、React 19、Vite 8、TanStack Router/Query/Table/Form、Zod、Hey API 及 Beautiful UI 所需 Tailwind/Inter/shadow-plugin；@base-ui/react 1.8.0 提供 shadcn 同源 Combobox 的可访问多选行为，@noble/hashes 2.4.0 提供 HTTP 兼容的 PKCE SHA-256，免费图标统一使用 Lucide。
pnpm-lock.yaml: pnpm 11 解析出的精确依赖锁，保证私有部署与 CI 使用同一供应链图。
pnpm-workspace.yaml: Console 与插件 contracts/remote-core 的共享协议边界，只允许构建 Vite 依赖的 esbuild；官方 CLI 使用 native-runtime 独立依赖树。
tsconfig.json: 浏览器 TypeScript 6 严格配置，启用 Bundler resolution 与 `@/` 源码路径；数组索引检查遵循锁定上游组件语义。
vite.config.ts: Console/workspace 双 document、TanStack 路由、React/Tailwind、Vitest 与 62209 开发入口；API 默认代理到 62207 TLS，验证码/PKCE callback 精确 bypass，Remote Upgrade 代理到 8090。
index.html: 控制台与认证页唯一 HTML 入口，禁止 Referrer 泄漏授权参数，在 React 挂载前恢复主题。
README.md: 本地安装、检查、启动、Beautiful UI 来源与 OpenAPI 生成物边界。
BEAUTIFUL_UI_LICENSE: 直接派生的 Beautiful UI Harness/foundation/primitive 源码所附 MIT 许可证。
EGO_LICENSE: 固定 Ego 客户端的独立 MIT 许可，随原生工作区静态资源发布。
DSH_LICENSE: 固定版本原生工作区资源的 DeepSeek MIT 许可证，随构建产物发布。
workspace.html: 原生远程工作区独立 document，隔离 Console 与 DSH 的渲染树，先鉴权建链再装配冻结 UI。
native-runtime/: 构建期官方 CLI 与独立锁，不进入生产运行时，局部地图见 native-runtime/CLAUDE.md。
public/: 控制台品牌、组件示例和构建生成的原生工作区静态资源；局部地图见 public/CLAUDE.md。
scripts/: OpenAPI 派生和固定原生 UI 构建脚本；局部地图见 scripts/CLAUDE.md。
src/: 浏览器应用、认证、静态角色路由、样式与生成 API；局部地图见 src/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
