# scripts/

> L2 | 父级: ../CLAUDE.md

成员清单

bootstrap-harness.ps1: Windows/PowerShell 开发环境入口，读取版本锁并准备同级 Harness checkout。
bootstrap-harness.sh: macOS/Linux 开发环境入口，执行与 PowerShell 脚本相同的版本锁校验和 checkout 准备。
upstream-baseline.mjs: T00 上游基线工具，验证三个机器锁并以临时 clone、Git archive 和原子重命名导入产品源码，拒绝覆盖已有目录。
upstream-baseline.test.mjs: 基线工具纯函数回归测试，覆盖锁格式、引用解析和来源地址归一化的成功与失败边界。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
