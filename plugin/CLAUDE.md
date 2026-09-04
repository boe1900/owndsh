# plugin/

> L2 | 父级: ../CLAUDE.md

成员清单

README.md: OwnDsh 标准 Harness 插件 workspace 说明，冻结官方 UI 零分叉、初装只填 Server 与树外发布边界。
package.json: workspace 根清单，固定 Node/pnpm，保证 bundle 构建后再打包；T11 在启动真实 Host 前强制刷新 bundle tgz，并统一暴露 test、consumer 与组合门禁。
pnpm-lock.yaml: workspace 锁定依赖图，固定编译、测试、React Client、OpenAPI 生成和 bundle 构建供应链。
pnpm-workspace.yaml: workspace 成员边界与生命周期脚本 allowlist，只接纳 `packages/*` 并仅允许已审核的 esbuild 原生安装脚本。
tsconfig.base.json: 共享 TypeScript 严格配置，统一 Node/Web 标准库、声明与 sourcemap 约束。
packages/: 正式企业插件模块，包含平台 Service、兼容 Harness 模型配置桥、受管插件 adapter、门禁 UI、自包含 bundle 与 contracts；局部地图见 `packages/CLAUDE.md`。
scripts/: tarball consumer 与锁定 Harness T01/T07/T11/T14/T15/T17/T18/T22 真实组合验收入口，只操作临时目录/profile；T01/T07 额外证明零配置安装和全局门禁。
workspace.test.mjs: workspace 不变量测试，校验 Desktop 派生的 Harness commit、工具链、正式 package 集合与同级 Harness 源码隔离。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
