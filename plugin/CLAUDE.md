# plugin/

> L2 | 父级: ../CLAUDE.md

成员清单

README.md: OwnDsh 标准 Harness 插件 workspace 说明，冻结官方 UI 零分叉、初装只填 Server 与树外发布边界。
package.json: workspace 根清单，固定 Node/pnpm，按 workspace 依赖顺序构建后再检查与打包；T11 在启动真实 Host 前强制刷新 bundle tgz，并统一暴露 test、consumer 与组合门禁。
pnpm-lock.yaml: workspace 锁定依赖图，固定编译、测试、React Client、OpenAPI 生成与 npm 官方 rc.2 Harness 开发依赖，使发布构建不依赖同级 checkout。
pnpm-workspace.yaml: workspace 成员边界与生命周期脚本策略，只接纳 `packages/*`、允许已审核的 esbuild 原生安装脚本，并显式拒绝上游已判定无须执行的传递脚本。
tsconfig.base.json: 共享 TypeScript 严格配置，统一 Node/Web 标准库、声明与 sourcemap 约束。
packages/: 正式企业插件模块，包含平台 Service、兼容 Harness 模型配置桥、受管插件 adapter、门禁 UI、自包含 bundle 与 contracts；局部地图见 `packages/CLAUDE.md`。
scripts/: tarball consumer 与锁定 Harness 真实组合验收入口，只操作临时目录/profile；test:desktop 通过显式 OWNDSH_TEST_RUNTIME 验证外部桌面运行树的插件认证与页面交互，不承担客户端构建。
workspace.test.mjs: workspace 不变量测试，在独立 CI 校验版本锁、工具链、正式 package 集合与源码隔离，本地存在同级 Desktop/Harness 时追加精确 commit 验证。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
