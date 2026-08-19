# scripts/

> L2 | 父级: ../CLAUDE.md

成员清单

t01-harness-smoke.mjs: T01/T06/T14 真实组合验收器，先断言 Harness 锁定 commit 与清洁度，再安装 bundle tgz 到临时 consumer/profile，验证 Web、本地状态与插件 API/SSE、installation、Client/Session seed 与上游清洁度。
t02-contract-consumer.mjs: T02 真实包验收器，把 contracts tgz 安装到全新临时 consumer，验证公开 ESM、品牌构造、严格错误解码和协议 hash。
t06-platform-client-consumer.mjs: T06 真实包验收器，安装 platform-client/contracts tgz 后验证 built-lib 导入、非秘密 installation 与无 ambient/Harness 源码依赖。
t07-browser-harness.mjs: T07 真实浏览器组合载体，以临时 profile 启动可控回环假平台与锁定 Harness，覆盖取消、READY、认证过期和设备撤销。
t11-harness-model-smoke.mjs: T11 真实模型组合验收器，在临时 web profile 通过官方 ctx.llm 验证动态目录、default、流、错误矩阵、rc.7 peer 与无本地上游 Key。
t14-dsh-plugin-smoke.mjs: T14 真实 CLI 验收器，在带空格的临时制品路径和 DSH_HOME 上验证 enterprise profile exact add、回滚、remove 与上游只读。
t14-plugin-distribution-consumer.mjs: T14 树外 consumer，安装三个发布 tgz 并验证 built-lib import、JCS、原子非秘密状态与无 ambient shim。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
