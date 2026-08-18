# ui/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: Client UI 边界说明，记录 sidebar slot 与同源本地 API 的数据方向。
package.json: 私有双入口 package 清单，Host 空入口与 Client React 入口分离。
tsconfig.json: React 18 Client TypeScript 构建边界，生成 ESM、声明和 sourcemap。
src/client.tsx: 脱敏状态 fetch、稳定 footer 控件与 `sidebar.footer.action` Client 注册实现。
src/index.ts: 无运行行为的 Host 占位入口，使官方 scanner 从 Loader row 发现 Client half。
tests/client.spec.ts: 同源状态 DTO 解码与 slot 注册参数的 Vitest 验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
