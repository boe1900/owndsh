# scripts/

> L2 | 父级: ../CLAUDE.md

成员清单

bootstrap-harness.ps1: Windows/PowerShell 开发环境入口，读取版本锁并准备同级 Harness checkout。
bootstrap-harness.sh: macOS/Linux 开发环境入口，执行与 PowerShell 脚本相同的版本锁校验和 checkout 准备。
bootstrap-desktop.mjs: 跨平台 Desktop 开发环境入口，按发行锁准备同级 Desktop checkout 及其 Harness submodule，拒绝污染或版本漂移。
local-demo.sh: 人工验收唯一启动入口，以随机 HTTP 端口、全新临时 release 后端和源码 CLI shim 驱动单个真实浏览器 Harness，提供可执行受管插件调和且无自动业务操作的本地体验环境。
scan-sensitive-logs.mjs: CI 日志流式扫描器，检测常见凭据形状与外置受控 literal 且不回显命中内容。
scan-sensitive-logs.test.mjs: 日志扫描器自验，覆盖递归干净日志、Bearer 与受控明文失败。
t20-recovery-drill.sh: 隔离 Docker 故障演练，覆盖 PostgreSQL/Redis kill-restart、全新恢复、artifact/key 分离备份与只读磁盘。
upstream-baseline.mjs: 客户端基线工具，验证 Desktop→Harness 派生锁与本地 checkout 的精确版本。
upstream-baseline.test.mjs: 基线工具纯函数回归测试，覆盖 Desktop/Harness 锁对齐、锁格式和来源地址归一化的成功与失败边界。
v1-e2e-fixture.mjs: V1 E2E 共用 OIDC Authorization Code + PKCE 与三协议模型上游，支持 429/5xx/断流/无 usage 状态并仅记录脱敏请求事实。
v1-e2e-harness.mjs: V1 E36-E47 锁定 Harness 真实纵向验收器，自动完成 LOCAL PKCE 登录并验证三协议重试归属、受管插件完整生命周期、设备撤销、审计关联与 Session 停用。
v1-e2e-models.mjs: V1 E23-E35 模型目录、模型集授权、Token 窗口、Provider/成员 RATE 与结算恢复的真实纵向验收模块。
v1-e2e-release.mjs: V1 E43-E47 受管插件安全验包、签名发布、Harness CLI 生命周期、设备撤销、审计关联与 Session 停用验收模块。
v1-e2e-compose.yml: 在现有部署 Server 上只读挂载本轮 LDAP truststore 的临时 Compose 叠加层，不复制生产拓扑。
v1-e2e-support.mjs: V1 E2E 的 PKCE、Cookie/Bearer HTTP、断言记录和 Compose PostgreSQL 查询标准库原语。
v1-e2e.mjs: V1 E01-E48 的真实部署、身份、模型、配额、Harness、插件与产品壳发布验收编排器。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
