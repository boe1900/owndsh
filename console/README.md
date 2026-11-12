# Product Console

OwnDsh Console 包含独立 Vite 管控台和原生 DSH 工作区两个 document，不依赖旧 Umi、Ant Design 或动态菜单运行时。

产品壳与 `/examples` 直接迁移自 Beautiful UI Harness commit `3ea4c18114de3d4bc9b63b8e3ea6f533b1a562bd`。上游 Next.js 运行时改为 Vite/TanStack，Central Icons 改为 Lucide，并移除 PostHog；其余组件源码与完整 Harness 保留为可执行参考。版本锁见 `../upstream/beautiful-ui.lock.json`，许可证见 `BEAUTIFUL_UI_LICENSE`。

```sh
pnpm install
pnpm check
pnpm dev
```

产品入口为 `/`，登录入口为 `/login`，组件参考为 `/examples`，完整 Harness 为 `/examples/harness`。本地开发将 `/enterprise` 与 `/healthz` 代理到 `CONSOLE_API_ORIGIN`，缺省为本机 OwnDsh TLS 入口 `https://127.0.0.1:62207`；自定义目标仍通过该环境变量覆盖；`/enterprise/auth/callback` 与部署 nginx 同构由本机 SPA 承接，PKCE 回调可在 dev 服务完成。`62209` 只承担 UI/HMR，完整 PKCE 通过服务端已注册回调的同源 Console 构建验收。

连接远端后端调试时，目标部署需设置 `ENT_CONSOLE_DEV_ORIGINS=http://127.0.0.1:62209`（服务端仅接受 loopback 主机 + 1024 以上显式端口的 origin，逗号分隔，生产留空）；随后 `CONSOLE_API_ORIGIN=http://<远端地址> pnpm dev` 即可完成登录、Cookie 会话与写操作，无需任何本机域名劫持。

控制台支持内网 HTTP 域名/IP 与 HTTPS：PKCE S256 使用纯 JavaScript SHA-256，登录随机值与写操作的 UUID 幂等键使用 `crypto.getRandomValues`，不依赖仅安全上下文可用的 `crypto.subtle` 或 `crypto.randomUUID`。服务端 redirect allowlist 仍需精确注册实际入口的 `/enterprise/auth/callback`（含协议、域名/IP 与端口），例如 `http://owndsh.internal/enterprise/auth/callback`；本地开发端口的放行走专用 `ENT_CONSOLE_DEV_ORIGINS`，而非修改 public base。

OpenAPI 客户端由 `../contracts/enterprise-openapi.yaml` 生成；不要手改 `src/api/generated/`。

侧栏“远程连接”列出本人设备、状态及不可连接原因。在线、开启远控且版本支持的设备以原生链接新标签打开 `/workspace.html?deviceId=...`，原管控台页面和 tabs 保留。设备目录支持手动刷新，刷新失败保留上次结果。账号菜单只保留账号动作，管理端 `/remote` 标为“远程诊断”，权限不变。普通员工从 `/account` 同样看到自己的设备分组。

远程页复用当前 Cookie 登录，建立加密连接并启动官方 UI，身份条显示固定设备名、文字连接状态与新标签管控台链接；原生品牌按钮仍新建会话。切换浏览器标签不释放连接。关闭、刷新、离开远程页或在错误页显式返回管控台会释放；身份条打开管控台不释放当前页。当前每个 Host 仍只允许一个控制 link，不抢占、不共享或自动重放。

`pnpm dev` 和 `pnpm build` 自动构建共享协议包并生成原生 UI。`pnpm native:prepare` 可单独重建 `public/native-workspace/`。该目录不进入 Git。脚本使用 `native-runtime/` 独立锁定的官方 `@deepseek-ai/dsh@0.2.1-rc.5`，短暂启动隔离 Host 后采集静态资源，结束时清理进程和临时凭据。生成资源随 Console 发布，附带 `DSH_LICENSE`。Docker 构建执行相同步骤，运行容器只需要 Nginx。

开发时将 `CONSOLE_REMOTE_ORIGIN` 指向同一 Server 的 Remote HTTP 端口，默认 `http://127.0.0.1:8090`。浏览器仍使用 Console 同源 `/remote/ws/v1`，由 Vite 或部署 Nginx 转发 Upgrade。HTTP API 目标由 `CONSOLE_API_ORIGIN` 设置，两个目标必须属于同一套后端。

初版只使用设备已有工作区。文件上传、任意目录创建、设置页和远端网站面板暂不开放。原生 UI 升级必须通过构建脚本的源码 hash 门禁，并重新检查设备身份条、文件 intake、图片和启动生命周期。能力与验收边界见 [工作区研究及初版状态](../docs/console-workspace-product-research.md)。
