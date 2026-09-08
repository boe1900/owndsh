<!--
[INPUT]: 依赖 Pake 构建脚本、官方 Harness npm 发行和本仓库插件制品。
[OUTPUT]: 提供 macOS 安装、首次连接、数据位置、构建和运行边界。
[POS]: 自包含员工客户端的使用与维护入口；不承载服务端部署说明。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# OwnDsh macOS 客户端

使用 Pake 3.16.1 封装官方 DeepSeek Harness Web，内置 Harness 0.1.2-rc.1、Node 24.14.1、pnpm 11.7.0 和本仓库构建的 owndsh-plugin 0.1.0。这是独立的 OwnDsh 客户端，不依赖社区 DSH Desktop，也不改写官方 Web 界面。Harness 版本以本次构建前 npm 最新发行查询为准，构建和运行均锁定版本。

## 使用

1. 打开 `dist/OwnDsh-0.1.0-macos-x64.dmg`，将 OwnDsh 拖到 Applications。
2. 打开 OwnDsh。应用自动启动仅监听 `127.0.0.1`、使用空闲端口的 Harness Web 服务。
3. 首次填写管理员提供的 OwnDsh Server HTTP(S) 地址，保存并登录。

不需要系统 Node、pnpm 或预装 Harness。首次 profile 初始化使用随包资源，不从 npm 下载。登录和模型调用需要网络及可用的 OwnDsh Server；客户端不包含服务端、模型权重、上游 API Key 或开发者账号。

当前交付目标是 Intel Mac，配置最低 macOS 13.5；其他 macOS 版本尚需目标机验证。安装包使用本地 ad-hoc 签名，尚未申请 Developer ID 签名与公证；下载分发时 macOS 可能要求在系统设置的隐私与安全性中允许打开。

点击红色关闭按钮会隐藏窗口，应用留在 macOS 菜单栏托盘并保留任务。左键点击托盘图标可显示或隐藏窗口，右键提供显示、隐藏和退出菜单。通过托盘“退出 OwnDsh”、应用菜单退出或 `Cmd+Q` 完全退出，结束本应用启动的 Harness 进程。再次打开会恢复同一 profile。重复打开由 Pake 单实例机制接管。

Dock 和 Finder 图标使用带透明留白的圆角版本，避免满幅方图显得过大；菜单栏使用独立单色模板图标，由 macOS 适配明暗外观。

OwnDsh 登出和卸载使用插件内的页面确认弹窗；取消或 Escape 不执行动作，明确确认才继续。该交互由插件负责，不依赖桌面壳的 `window.confirm()` 支持。

## 数据和权限

默认数据目录：

```text
~/Library/Application Support/com.owndsh.desktop/Harness/
```

`settings.yaml` 保存 Server 地址，官方 credentials 保存登录凭据，`profiles/web` 保存插件状态，`workspace` 是初始工作目录。`desktop.log` 保存本次启动日志；运行时 `desktop-runtime.json` 记录当前回环地址与进程。不会覆盖已有 `~/.dsh`。

Harness 以当前用户身份运行；封装不额外设置 CPU、内存或运行时长限制，也不改变官方工具审批机制。调用 Python、Git、Docker、编译器或第三方 MCP 时，相关工具仍需按项目需求安装。macOS 的文件访问授权仍然适用。企业账号的模型授权、配额和并发由 OwnDsh Server 决定。

升级应用后保留用户数据。由桌面初始化的依赖链接会指向新安装位置；用户通过官方 CLI 安装或卸载的插件归用户管理。完全退出并重开应用即可应用插件变更。受管插件分发仍要求管理员配置现有插件支持的 Ed25519 信任根。

## 构建

构建机需要 macOS、Node 24.14.1、pnpm 11.7.0、Rust stable 与 Xcode Command Line Tools。首次构建需要下载 npm/Cargo 依赖。

```sh
cd plugin
pnpm install --frozen-lockfile
pnpm run pack:bundle
cd ../desktop
npm ci --ignore-scripts
npm ci --prefix runtime --ignore-scripts
npm run build
npm test
```

输出 `dist/OwnDsh.app` 和对应架构的 DMG。`runtime/build-info.json` 记录运行版本与插件 SHA-256，Pake 和 Node 许可证随包附带。构建脚本只修改 `.build/` 中的 Pake 副本。Pake 采用 GPL-3.0-or-later 及其 LICENSE-EXCEPTION，分发桌面壳时需保留相应许可证和源码获取方式。

`npm run prepare:runtime` 只准备测试运行树，不执行 Rust 编译。`OWNDSH_TEST_RUNTIME=/path/to/OwnDsh.app/Contents/Resources/runtime npm test` 可直接验证安装包内的运行环境。测试覆盖无系统 Node/pnpm、首次未配置、WebSocket、Server 保存与重启、父进程断开后的清理，以及插件卸载不被初始化器复活。

`OWNDSH_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node --test confirm.test.mjs` 使用已有 Playwright/Chromium 验证插件页面确认；可设置 `OWNDSH_BROWSER=webkit` 使用已安装的 WebKit。该测试加载真实 Harness 与插件，只在临时 profile 中拦截账号 API，不登出真实用户或卸载实际插件。

`OWNDSH_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:e2e` 追加真实认证闭环：临时 HTTP 企业授权/模型服务验证 PKCE，Chromium 使用发行 Harness 登录并发送聊天；测试推进隔离 Host 时钟，覆盖闲置零请求、请求续期、网络故障后重试、Refresh Token 失效回登录门禁、重新登录恢复对话和设备撤销。认证路径不拦截本地状态 API、不修改真实用户凭据；`.build/auth-e2e-result.json` 与 `.build/auth-expired.png` 留存结果，失败时输出脱敏诊断。

2026-09-07 确认弹窗修复验证：复用官方工作区删除所用的共享 Modal/Button；UI 14 项、bundle 3 项与运行环境回归通过。真实发行 Web 在 1400×900 和 375×720 下验证侧栏/设置页登出、门禁卸载、取消零请求、确认单次请求、焦点循环和登出后关闭设置页；已安装 macOS WKWebView 实测确认框显示、取消与 Escape 后账号仍为 READY。更新后的 app 签名和 DMG 校验通过。

本次在 Intel / macOS 14.8.4 上验证了安装包内运行环境、原生窗口、单实例、应用位置变化和正常退出回收；圆角透明边距与托盘模板 alpha 检查通过，原生实测关闭窗口保留 Host、左键托盘恢复、右键退出回收 Host。Playwright 验证首次空地址、保存和刷新，无页面异常。旧基线平台插件 24 项测试、bundle 3 项测试通过。未连接真实 OwnDsh Server 做企业登录和模型调用验收，也未验证 ARM、Windows 或 Linux 发行。
