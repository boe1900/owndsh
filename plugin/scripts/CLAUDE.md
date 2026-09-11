# scripts/

> L2 | 父级: ../CLAUDE.md

成员清单

desktop-auth.test.mjs: 消费显式 OWNDSH_TEST_RUNTIME 的 macOS/Chromium 认证闭环，验证闲置零请求、过期续期、网络恢复与设备撤销；使用隔离 profile。
desktop-confirm.test.mjs: 消费显式 OWNDSH_TEST_RUNTIME 的插件页面验收，覆盖只读账号地址、退出后修改/失败保留/授权锁定，以及市场、官方确认框与焦点。

t01-harness-smoke.mjs: T01/T06/T14 真实组合验收器，将零业务配置 bundle 安装到锁定临时 profile，验证 `UNCONFIGURED`、Server API/settings 持久化、Client bundle、本地状态/插件 API/无 SSE 与上游清洁度。
t02-contract-consumer.mjs: T02 真实包验收器，把 contracts tgz 安装到全新临时 consumer，验证公开 ESM、品牌构造、严格错误解码和协议 hash。
t06-platform-client-consumer.mjs: T06 真实包验收器，安装 platform-client/contracts tgz 后验证 built-lib 导入、非秘密 installation 与无 ambient/Harness 源码依赖。
t07-browser-harness.mjs: T07 真实浏览器组合载体，以零业务配置临时 profile 启动可控回环假平台与锁定 Harness，覆盖 Server 设置、全局门禁、READY、认证过期和设备撤销。
t11-harness-model-smoke.mjs: T11 真实模型组合验收器，验证 bundle caret peer 安装，并在临时 rc.2 web profile 通过官方 ctx.llm 与 Agent 恢复层覆盖动态目录、default、三协议流、xhigh、瞬时 503 重试、终态 quota 零重试、错误矩阵与无本地上游 Key。
t14-dsh-plugin-smoke.mjs: T14 真实 CLI 验收器，在带空格的临时制品路径和 DSH_HOME 上验证 enterprise profile exact add、回滚、remove 与上游只读。
t14-plugin-distribution-consumer.mjs: T14 树外 consumer，安装三个发布 tgz 并验证 Harness 兼容 peer、built-lib import、JCS、原子非秘密状态与无 ambient shim。
t15-browser-harness.mjs: T15 真实浏览器载体，签名目录同时提供 bootstrap 与点击时授权复查，用户显式安装后验证真实 CLI/Loader，并由控制端点收口清理。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
