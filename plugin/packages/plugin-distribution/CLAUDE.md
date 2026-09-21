# plugin-distribution/

> L2 | 父级: ../../CLAUDE.md

成员清单

README.md: 安装地址、宿主 pnpm、固定版本身份、私有源认证与破坏性迁移说明。
package.json: 私有 workspace package 清单，声明兼容 Harness subprocess/inventory peer 与可打包产品依赖。
tsconfig.json: Node TypeScript 构建边界，从 `src/` 生成 ESM、声明与 sourcemap。
src/cli.ts: Web 走官方 `ctx.subprocess`、Desktop 走公开 command port 的单一 argv 边界，显式透传 DSH_HOME 并限制诊断输出。
src/errors.ts: 本地稳定分发错误码，状态文件和库存只持久化 code 而不保存中心正文。
src/index.ts: package facade、Cordis Context 合并与公开类型出口。
src/service.ts: 企业可选目录和显式安装/卸载的串行所有者；点击时重查授权，绑定版本 ID，委托宿主安装并核对结果，重启后将 ABSENT 记录收敛为未安装并上报库存。
src/state-store.ts: plugin-installations.json 的严格解析与私有权限原子替换，不读取旧制品状态文件。
src/types.ts: 官方平台/宿主窄 port、必填安装配置和版本 ID 状态，配置只包含运行参数。
src/verification.ts: 校验 npm 精确版本、Git 固定 commit、tgz URL/绝对路径；绑定依赖键并核对安装后实际包名、版本和 bundle 文件。
tests/service.spec.ts: 覆盖四类安装源、授权复查、核心保护、错误包拒绝、失败重试、串行操作、版本切换/撤回与进程重启确认。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
