# scripts/

> L2 | 父级: ../CLAUDE.md

成员清单

bootstrap-harness.ps1: Windows/PowerShell 开发环境入口，读取版本锁并准备同级 Harness checkout。
bootstrap-harness.sh: macOS/Linux 开发环境入口，执行与 PowerShell 脚本相同的版本锁校验和 checkout 准备。
scan-sensitive-logs.mjs: CI 日志流式扫描器，检测常见凭据形状与外置受控 literal 且不回显命中内容。
scan-sensitive-logs.test.mjs: 日志扫描器自验，覆盖递归干净日志、Bearer 与受控明文失败。
t20-recovery-drill.sh: 隔离 Docker 故障演练，覆盖 PostgreSQL/Redis kill-restart、全新恢复、artifact/key 分离备份与只读磁盘。
t22-candidate.sh: T22 动态候选入口，生成三套 TLS 信任边界、构建/安装正式 release、编排隔离 fixture/三设备 Harness/14 步 Playwright、失败销毁前日志取证、可选有界人工暂停、媒体和敏感扫描并精确清理自身资源。
t22-release-checks.sh: T22 功能候选总门禁，顺序执行 Backend/Admin/Harness/consumer/OpenAPI/Compose、唯一 release 完整性与同一制品 14 步候选验收；非生产 MVP 明确不执行镜像漏洞扫描。
upstream-baseline.mjs: T00 上游基线工具，验证三个机器锁并以临时 clone、Git archive 和原子重命名导入产品源码，拒绝覆盖已有目录。
upstream-baseline.test.mjs: 基线工具纯函数回归测试，覆盖锁格式、引用解析和来源地址归一化的成功与失败边界。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
