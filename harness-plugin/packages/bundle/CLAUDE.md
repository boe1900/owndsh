# bundle/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 企业组合包发布说明，定义预构建 tarball、裸包名 patch 与无运行 dependencies 边界。
package.json: `dsh.bundle` 与 `dsh.client` 双清单，导出 Host ESM、lazy-CJS Client 和 patch。
tsconfig.json: bundle Host 公开声明的 emit-only TypeScript 边界，通过 workspace package 声明消费产品模块且不映射 Harness 源码。
cordis.patch.yml: 官方 profile layer，插入单一企业 Host/Client Loader row。
scripts/build.mjs: 将正式 workspace 模块打入自包含 Host ESM 与官方 lazy-CJS Client factory 的构建器。
src/index.ts: bundle Host 组合入口，使用必填 HTTPS baseUrl 挂载 ctx.enterprisePlatform，并注入 T01 限定 session-sync 验收 seam。
tests/bundle.spec.ts: manifest、构建产物、Client factory 与无 Typert shim/package 越界的 Vitest 验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
