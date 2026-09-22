<!--
[INPUT]: 依赖安装配置、官方插件命令、平台授权与 Loader 库存。
[OUTPUT]: 定义企业可选插件安装、依赖、状态与迁移边界。
[POS]: plugin-distribution 的公开语义入口，中心管理可用范围，宿主管理安装。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->
# @owndsh/plugin-distribution

管理员登记包名、精确版本与安装目标，发布后配置 ALL/USER 可见范围。支持：

- npm：`@company/plugin@1.2.0`，省略目标时管理端自动填入包名和版本。
- GitHub：`github:owner/repo#完整40位commit`，子目录可追加 `&path:/plugins/example`。
- 包文件：HTTP(S) `.tgz` URL。

显示名称、简介、作者、分类和源码仓库独立于安装目标。源码仓库一般填写 GitHub URL，可留空。

员工在设置的插件 tab 搜索/筛选分类，查看详情并确认固定版本后安装。每次安装重新读取当前授权；打开页面、刷新、发布新版本均不会自动安装。删除范围或退休只停止新安装，显式 ABSENT 才撤回受管插件。

Web/Desktop 都调用官方 `pluginManager.installBundle()`、`removeBundle()` 和 `listBundles()`。Git/URL/路径目标绑定到管理员指定的依赖键；安装完成后核对实际包名、版本、启用状态和 `dsh.bundle.patch` 文件。版本切换使用官方 `installBundle()` 写入新的精确目标。

允许正常 `dependencies`、peer dependencies 和构建脚本声明。获取依赖、registry、锁文件及脚本允许策略全部由宿主现有 pnpm 处理，不附加 `--ignore-scripts` 或自行安装依赖。企业私有包使用宿主已配置的 `.npmrc`、Git 凭据/SSH；Server 不保存或转发这些凭据。宿主若阻止构建脚本，应在其 pnpm 配置中授权对应依赖后重试。

官方结果为 `restart-required` 时进入 `RESTART_REQUIRED`，下一进程读取官方 `pluginInventory.list()` 确认 Loader 后才标记 ACTIVE。Desktop 有 `desktopActions.requestRestart()` 时显示官方立即/稍后重启操作，其他宿主提示用户手动重启。失败记录稳定错误码，允许重试或卸载，不把包管理退出码当作插件启用成功。

本机选择写入 `$DSH_HOME/enterprise/plugin-installations.json`，不读旧 `managed-plugins.json`。V34 清空旧上传目录、可见范围和库存并删除制品列，需要重新登记插件并同步更新 Server/Console/员工插件；不迁移旧上传制品，不提供旧上传、下载或验签接口。历史审计账本保留。OwnDsh 与 Desktop 核心包禁止通过企业目录更新或卸载。

2026-09-17 验证：客户端 147 项单元/集成测试、服务端迁移/契约/安全 24 项、部署 14 项、控制台 34 项及 production build 通过。锁定 Harness CLI 在带空格路径安装普通 `semver` 依赖、切换版本和卸载通过；Harness 0.1.5-rc.2 桌面运行包的隔离浏览器回归覆盖分类搜索、详情确认后才安装、重启提示、卸载与窄屏布局。浏览器 API 使用测试目录，真实私有 registry/Git 认证未在本轮实测。
