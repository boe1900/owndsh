<!--
[INPUT]: 依赖当前镜像/插件制品、真实 HTTP Compose、锁定 Harness 与两条独立 E2E 脚本的执行证据。
[OUTPUT]: 记录默认免签名配置、显式验签、员工安装生命周期和离线备份恢复的真实验收范围与复现方法。
[POS]: 本次签名策略变更的纵向验收记录，结果以 artifacts 中本轮脱敏证据为准。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# 插件签名开关 E2E 验收

日期：2026-09-09（Asia/Shanghai）。

结果：**22/22 项真实 E2E 通过**，包括 16 项 HTTP/Harness 场景和 6 项离线安装/备份/恢复检查。测试结束后，隔离容器、数据卷和临时密钥目录均已清理；同级 Harness 工作区保持干净。

## 环境与边界

- 当前 Server 源码执行 Maven `-Pprod -DskipTests -pl owndsh-server -am package`；当前 Console 执行 `pnpm build`。镜像使用正式 Dockerfile 的完整运行阶段和固定 JRE/Nginx digest，架构为 Linux amd64，分别以 10001/101 用户运行。
- 当前 `owndsh-plugin` 构建后重新打包；真实 Harness 为 `0.1.1-rc.2`，commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。
- PostgreSQL 17.6、Redis 7.4.5、制品卷与 Server 日志卷均为本轮隔离资源。全程通过 HTTP Console 网关访问，数据库从空库执行基线和 Flyway V1–V29。
- 首次改密、PKCE、设备注册、bootstrap、插件上传/发布/分配/下载/库存均走真实 API；安装、升级、回滚、卸载走官方 Harness CLI，每次安装通过真实进程重启确认 ACTIVE。
- 验证码保持默认开启；测试从隔离 Redis 只读取得真实验证码答案，再经登录接口一次性消费。未修改登录或验签实现来放行测试。
- 本记录覆盖此次签名策略及其部署链路；不等同于完整产品 LDAP、模型调用或各操作系统原生 Desktop UI 发布矩阵。

## 复现

准备当前源码镜像和插件 tgz 后执行：

```sh
OWNDSH_E2E_SERVER_IMAGE=owndsh-server:signing-e2e-20260909 \
OWNDSH_E2E_CONSOLE_IMAGE=owndsh-console:signing-e2e-20260909 \
  node scripts/plugin-signing-e2e.mjs

OWNDSH_E2E_SERVER_IMAGE=owndsh-server:signing-e2e-20260909 \
OWNDSH_E2E_CONSOLE_IMAGE=owndsh-console:signing-e2e-20260909 \
  sh scripts/plugin-signing-ops-e2e.sh
```

两条脚本各自创建独立 Compose 项目和临时目录，退出时清理该轮资源。主脚本把每项结果写入 `artifacts/plugin-signing-e2e-<runId>.json`；运维脚本输出逐阶段 PASS，可重定向保存。主脚本要求同级 Harness 工作区干净且与版本锁一致。

## 构建指纹

| 制品 | SHA-256 / image ID |
| --- | --- |
| Server JAR | `f19bf7f709eef2ee510f27beac037fea6c5956a7ae95c3571e8bd7410113c738` |
| 员工插件 tgz | `7ee2df304bdc91b6e29bb147acd4db38aaeeb4dead2ddecabed3ed9e650a7756` |
| Server image | `c31616fb8f5163dda3d4a2f6013401230984f418fb6a2bbe4222adbb124be29a` |
| Console image | `b4b87d2af25561a7d3e3c39aef190f80a3ee7a5181511b904d44715be5cb30e7` |

## 离线运维结果

默认关闭和显式开启两种模式均通过真实 `install.sh → backup.sh → restore.sh`。默认模式没有生成签名文件，profile 没有公钥配置，独立 key 归档只包含 master key。开启模式生成密钥并配置两端开关，归档保留完整密钥对。

每种模式在备份后修改 PostgreSQL 探针记录、修改 Redis 值、删除 artifact 探针文件，再从归档恢复；三者均恢复备份时的值。开启模式还在恢复前替换签名私钥，恢复后的完整 key 指纹与备份前相同。全部 6 项检查通过，证据：`artifacts/plugin-signing-ops-e2e-20260909.json`。

## HTTP / Harness 结果

| 场景 | 结果 |
| --- | --- |
| S01 默认无私钥的真实 HTTP Compose 启动并完成首次改密 | PASS |
| S02 当前插件 tgz 在真实 Harness 中完成 PKCE 登录和 bootstrap | PASS |
| S03 无签名上传、发布和目录可见，不自动安装 | PASS |
| S04 员工显式安装无签名插件并重启确认 ACTIVE | PASS |
| S05 新版本不自动升级，员工显式升级后 ACTIVE | PASS |
| S06 复用真实本地制品缓存回滚并重新授权 | PASS |
| S07 关闭验签仍拒绝损坏制品，恢复后可安装 | PASS |
| S08 删除可见范围后禁止安装，即使已有缓存 | PASS |
| S09 员工显式卸载，重启后库存不再有该插件 | PASS |
| S10 显式启用但缺失或非法私钥时服务启动失败 | PASS |
| S11 启用服务端签名后仅新上传版本签名，旧版本不补签 | PASS |
| S12 客户端开启验签后拒绝无签名版本和已有缓存 | PASS |
| S13 客户端开启验签后正确公钥安装真实签名制品 | PASS |
| S14 开启验签后缺公钥和错误公钥均阻断已有安装快捷路径 | PASS |
| S15 有效公钥仍拒绝被篡改的签名元数据 | PASS |
| S16 两端关闭后忽略遗留非法密钥并继续安装 | PASS |

本轮 Harness 共启动 13 次，覆盖真实进程重启和会话恢复。证据：`artifacts/plugin-signing-e2e-fa43fe42.json`。本地镜像和插件已构建，未发布或替换现有运行环境。
