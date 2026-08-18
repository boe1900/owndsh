# bundle/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 企业组合包发布说明，定义预构建 tarball、裸包名 patch 与无运行 dependencies 边界。
package.json: `dsh.bundle` 与 `dsh.client` 双清单，Client 最小注入官方 runtime、sidebar 与 settings shell。
tsconfig.json: bundle Host 公开声明的 emit-only TypeScript 边界，通过 workspace package 声明消费产品模块且不映射 Harness 源码。
cordis.patch.yml: 官方 profile layer，插入单一企业 Host/Client Loader row。
scripts/build.mjs: 将正式 workspace 模块打入自包含 Host ESM 与官方 lazy-CJS Client factory 的构建器。
src/index.ts: bundle Host 组合入口，生产强制 HTTPS，仅在显式技术探针下允许回环假平台并保留 Session seed seam。
tests/bundle.spec.ts: manifest 最小 Client graph、构建产物、三 slot factory 与无 Typert shim/package 越界验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
