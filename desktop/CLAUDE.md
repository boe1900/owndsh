# desktop/

> L2 | 父级: ../CLAUDE.md

成员清单

README.md: 安装、首次连接、权限边界、独立数据目录和可复现构建说明，明确当前 Intel macOS 本地签名交付范围。
package.json: macOS Pake 客户端构建与运行环境/E2E 验证入口，构建工具与内置 Harness 运行环境分别安装。
package-lock.json: Pake 与桌面构建工具的完整 npm 依赖锁。
build.mjs: 从锁定 npm 源码生成 Host hook 与原生托盘配置，沿用 Pake 圆角留白参数并生成明暗自适应模板图标，每次重建运行树后产出本机架构 app/DMG。
launcher.mjs: 内置 Node 的离线 profile 播种与官方 CLI 启动器，向原生窗口传递官方启动凭证但不落盘，用父进程 stdin 和进程组回收管理 Host 生命周期。
launcher.test.mjs: 真实内置运行时回归，在空白用户目录和最小 PATH 下验证首次启动、WebSocket、配置持久化、单次恢复状态收敛与进程清理。
confirm.test.mjs: Playwright 加载真实发行 Web，在临时 profile 拦截账号/市场 API，验证账号单行省略、刷新与取消编辑、半像素位置/明暗/窄屏布局、插件零自动安装和详情/确认动作；检查控件可点击性和弹窗焦点。
auth.test.mjs: Chromium 驱动真实发行 Harness、PKCE 与聊天框，以隔离 Host 时钟模拟凭据过期，验证闲置零请求、续期、网络恢复、失效登录门禁、重新登录和设备撤销；输出 .build 验收结果及截图。
host.rs: Pake setup/exit 的原生适配，严格校验回环地址与唯一 token 查询参数后创建窗口，保留官方 Cookie 交换认证，退出时等待 Host 排空。
runtime/package.json: 自包含 Node Host 的精确依赖清单，内置最新已确认 Harness 与 pnpm，OwnDsh 由本仓库构建加入。
runtime/CLAUDE.md: 内置运行环境的局部地图。

官方 Web 与企业插件保持各自所有权；桌面层只负责离线初始化、回环服务与窗口生命周期。构建缓存不进入 Git，发行包不包含开发者配置或凭据。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
