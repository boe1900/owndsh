# 插件市场服务端与客户端联合 E2E

2026-09-17，`scripts/plugin-market-e2e.mjs` 的 P01–P10 全部通过。使用当前源码构建的 Server 与 `owndsh-plugin`，管理操作走真实管理 API，安装与卸载确认走真实 Chromium 页面，产品 API 无拦截或 mock。

## 环境与隔离

- Java 21；PostgreSQL 17.6、Redis 7.4.5 临时容器；随机本机端口。
- 外置 OwnDsh Desktop npm runtime 的临时副本，Harness `0.1.5-rc.2`、pnpm `11.26.0`，独立 `DSH_HOME`。
- 当前插件通过官方 CLI 安装到临时 profile；真实 LOCAL 验证码、首次改密、PKCE 和设备登记。验证码答案仅从本轮 Redis 读取。
- Server 启用 deploy profile，全新数据库执行到 V34；未连接原有 `owndsh-server-dev2`、PostgreSQL 或 Redis。
- 测试结束自动停止 Server/Host，删除测试容器及临时 runtime/profile。证据保留在 `.tmp/plugin-market-e2e/`，不包含认证凭据。

## 已通过场景

| 编号 | 实际验证 |
| --- | --- |
| P01 | 新库迁移、首次改密、PKCE 与 HttpOnly 管理会话 |
| P02 | 当前插件经官方 CLI 安装、Host 登录、真实设备登记 |
| P03 | 两个版本通过 JSON 登记和发布，包含 `semver@7.8.4` 普通依赖 |
| P04 | USER 命中可见；改给其他用户后，旧目录发起安装返回 403；ALL 范围恢复可见 |
| P05 | 点击卡片只打开详情；确认才执行 pnpm；客户端与服务端均为 `RESTART_REQUIRED` |
| P06 | 重启静默恢复会话；Loader 实际执行插件，HTTP 探针返回正确版本及依赖调用成功；库存为 `ACTIVE` |
| P07 | 新版授权拒绝旧 version ID；`1.0.0 → 1.1.0 → 1.0.0` 每次重启后执行结果与库存一致 |
| P08 | 卸载取消不改变安装；确认卸载并重启后，插件记录、profile 依赖声明、运行路由及服务端库存均清除 |
| P09 | 管理员设置 ABSENT，Host 自动调用官方 CLI 卸载，重启后库存清除 |
| P10 | REGISTERED/PUBLISHED/ASSIGNED/INVENTORY 审计真实落库；浏览器脚本异常为零 |

本轮同步修正旧 `v1-e2e-release.mjs` 的卸载断言：设备库存是完整替换，确认卸载后不应保留该插件记录。

## 宿主构建策略前提

实测 pnpm 11 首次解算宿主依赖时，会因 `@google/genai`、`protobufjs` 未获构建许可返回 `ERR_PNPM_IGNORED_BUILDS`。本轮在临时 profile 的 `pnpm-workspace.yaml` 中通过原生 `allowBuilds` 明确批准这两项，之后官方 CLI 安装成功。该配置仅用于测试环境，不会写入产品或现有用户 profile，也没有全局启用脚本或增加 `--ignore-scripts`。

因此本结果证明的是**宿主构建策略已配置时**的完整安装链路；全新 profile 尚未批准构建时，仍需要按宿主 pnpm 策略处理。企业层继续把依赖与构建审批交给宿主。

## 复现

先构建当前源码，再显式提供已经构建好的桌面 npm runtime 和现有 Playwright 模块路径：

```sh
(cd server && ./mvnw -Pdev -DskipTests package)
corepack pnpm@11.7.0 --dir plugin --filter owndsh-plugin build
OWNDSH_TEST_RUNTIME='/absolute/path/to/OwnDsh.app/Contents/Resources/runtime' \
OWNDSH_PLAYWRIGHT_MODULE='/absolute/path/to/playwright/index.mjs' \
node scripts/plugin-market-e2e.mjs
```

需要 Docker、Java、Node、Corepack、tar 与 Playwright Chromium。运行时不会修改传入的 runtime。可用 `OWNDSH_E2E_OUTPUT` 更换报告目录；脚本使用当前 jar/bundle，不代替构建步骤。

机器报告为 `.tmp/plugin-market-e2e/results.json`；页面证据为 `install-detail.png`、`restart-required.png`、`installed.png`，另保留脱敏 Server/Host 日志。

## 实测边界

本轮安装目标为带空格的客户端绝对 tgz 路径，普通 npm 依赖由真实 pnpm 解析。未覆盖插件本身的 npm/GitHub/tgz URL 安装源、企业私有 registry 凭据或 Windows。使用桌面发行包中的 Web Host，通过进程重启验证 Loader；未启动原生 Pake 窗口，也未验证社区 Desktop 的 `desktopActions` 重启按钮。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
