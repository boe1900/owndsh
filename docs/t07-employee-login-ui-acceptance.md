<!--
[INPUT]: 依赖锁定 Harness 0.1.1-rc.2、owndsh-plugin 发布包、官方 Client slots/settings 与可控回环平台。
[OUTPUT]: 提供零配置插件安装、Server 地址持久化、全局登录门禁、失效重锁和宿主零修改的 T07 验收证据。
[POS]: 员工客户端接入的独立验收真源，证明 OwnDsh 只交付标准插件而不维护官方 Web/Desktop UI 分叉。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# T07 员工插件门禁验收记录

状态：`completed`

最近验收日期：2026-09-04（Asia/Shanghai）

## 结论

员工侧只安装 `owndsh-plugin`，OwnDsh 不修改或维护官方 Harness Web/Desktop UI。插件通过公开
`settings.section`、`sidebar.footer.action` 和 `shell.overlay` 扩展点工作；初装后只填写 OwnDsh
Server 地址，不编辑 profile、不配置 API Key，也不要求员工填写插件信任公钥。

全屏门禁仅在 `READY` 和 `REFRESHING` 时放行。未配置、未登录、授权中、失败、登录过期和设备撤销
都会阻断宿主交互并提供对应动作；登录成功后门禁卸载，用户继续使用官方原生 UI。

## 核心实现

- Server origin 通过 `@deepseek-ai/dsh-settings` 保存为 `$DSH_HOME/settings.yaml` 中的
  `owndsh.serverUrl`；HTTP 和 HTTPS 均可使用，bundle `baseUrl` 只作可选安装默认值。
- 更换 Server 会取消在途登录和旧请求，清空内存 Token/bootstrap，并回到 `SIGNED_OUT`；平台 Token
  始终只存在 Host 内存。
- 浏览器只调用固定同源 `/enterprise/api/v1/local/*`；Server、登录、取消、退出和卸载均严格校验
  JSON 请求，不允许浏览器指定任意平台代理路径或认证 header。
- 显式卸载先移除当前已安装的受管插件、清空受管状态，再移除 `owndsh-plugin`。Desktop 通过官方
  `desktopActions.requestRestart()` 重启，普通 Web 只提示手动重启。
- 缺少安装层 Ed25519 公钥时，基础登录和模型代理保持可用，但受管插件安装以
  `ENT_PLUGIN_SIGNATURE_INVALID` 严格失败；bootstrap 无权替换信任根。
- V1 不实例化 Session 同步服务，账号 store 不自动读取 Session API。

## 自动验收

```sh
corepack pnpm check
node scripts/t01-harness-smoke.mjs \
  --tgz ../artifacts/owndsh-plugin-0.1.0.tgz
```

工作区门禁通过：UI `13/13`、contracts `9/9`、platform-client `24/24`、plugin-distribution
`14/14`、session-sync `15/15`、llm-gateway `4/4`、bundle `3/3`、workspace invariants `4/4`。

T01 在未修改的锁定 Harness `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` 临时 profile 中证明：

1. 发布包不携带业务配置也能安装，初始状态为 `UNCONFIGURED`。
2. `POST /enterprise/api/v1/local/server` 后状态变为 `SIGNED_OUT`，地址写入官方 `settings.yaml`。
3. Client bundle、状态 API、插件状态 API、本地事件和树外 package consumer 全部通过。
4. 验收前后锁定 Harness 工作区均为空。

## 真实浏览器验收

`scripts/t07-browser-harness.mjs` 使用临时 `DSH_HOME`、零业务配置发布包和可控回环平台启动真实
Harness Web。2026-09-04 实测依次通过：

1. 初始 `UNCONFIGURED` 全屏显示 OwnDsh 和 Server 输入，官方会话界面不可操作。
   Tab 与 Shift+Tab 焦点均封闭在门禁内，不会进入底层 sidebar、会话区或设置按钮。
2. 输入测试 Server 后状态进入 `SIGNED_OUT`，门禁显示企业登录和修改地址。
3. 浏览器 PKCE 完成后状态为 `READY`，门禁消失，官方 Harness 原生界面恢复。
4. 平台返回 `401 / ENT_AUTH_SESSION_EXPIRED` 后门禁重新出现并提供重新登录。
5. 重新登录后平台返回 `403 / ENT_DEVICE_REVOKED`，门禁再次出现并显示设备撤销语义。
6. 页面没有暴露 Token、provider API Key、信任公钥、CLI 输出或 Session 正文。

验收载体使用 HTTP loopback，同一地址校验同时接受 HTTP 和 HTTPS origin；生产部署仍推荐 HTTPS。
卸载命令顺序与 Desktop 成功响应后
重启由单元测试覆盖；真实浏览器验收不点击卸载，避免主动破坏正在运行的临时宿主。

## 边界

官方 UI、路由、会话列表、编辑器、终端和工作区均归上游维护。OwnDsh 只维护插件公开扩展面、
企业 Server 与产品控制台；上游升级通过版本锁和未修改宿主 smoke 验证兼容性。
