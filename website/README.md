<!--
[INPUT]: 依赖官网静态文件、Node 标准库构建和 Cloudflare Pages 发布约定。
[OUTPUT]: 提供线上地址、本地预览、Git 自动部署、直接上传与素材维护说明。
[POS]: 官网维护和发布入口；OwnDsh 控制面仍遵循根 README 的 Docker Compose 部署。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->
# OwnDsh 官网

纯 HTML + CSS + JavaScript，零第三方构建依赖。品牌、真实截图和字体均由本站提供，不依赖外部 CDN 或业务 API。官网部署与 OwnDsh 控制面服务独立。

## 线上站点

- 正式域名：<https://owndsh.1024300.xyz>
- Pages 默认地址：<https://owndsh.pages.dev>
- Cloudflare Pages 项目：`owndsh`，采用直接上传；仓库推送不会自动发布。
- DNS：`owndsh.1024300.xyz` 的 CNAME 指向 `owndsh.pages.dev`，由 Cloudflare 管理 DNS 和 HTTPS。

## 本地查看

直接用浏览器打开 `website/index.html`。无需启动业务服务或开发服务器。浏览器不允许剪贴板访问时，复制按钮会选中命令并提示手动复制。

构建和检查（Node 22+）：

```sh
cd website
npm test
npm run build
```

产物位于 `website/dist/`。测试会先清理并重新构建此目录；不会修改源文件。

## Cloudflare Pages：Git 自动部署

以下用于新建 Git 集成项目，当前 `owndsh` 项目按下一节直接上传更新。在 Cloudflare 控制台选择 **Workers & Pages → Create application → Pages → Connect to Git**（若界面提供 Workers/Pages 选择，选择 Pages）。连接 `boe1900/owndsh` 仓库，配置：

| 配置 | 值 |
| --- | --- |
| 生产分支 | 实际对外发布分支，通常为 `main` |
| Framework preset | `None` |
| Root directory | `website` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| 环境变量 | `NODE_VERSION=22` |

保存部署后，Cloudflare 会提供 `*.pages.dev` 地址。后续推送到生产分支会自动部署。自定义域名在该 Pages 项目的 **Custom domains** 中添加。

## Cloudflare Pages：直接上传

本地运行构建后，在 **Workers & Pages → owndsh → 创建部署** 中选择生产环境，上传 `website/dist/` 整个目录，或压缩该目录中的内容后上传。不要上传仓库根目录，也不要上传 `website` 源码目录。

也可使用官方 CLI，在 `website/` 执行：

```sh
npm run build
npx wrangler pages deploy dist --project-name owndsh --branch main
```

Wrangler 会引导登录，并发布到现有 `owndsh` 项目的生产分支 `main`。本项目没有 Worker、Pages Functions、数据库绑定或必填密钥。

## 维护

- 文案与安装命令以根 `README.md` 为准。当前发布通道为 `next`，产品仍为预发布状态。
- `assets/console.jpg`、`assets/desktop.jpg` 来自仓库维护者提供的社区截图，只移除产品外部边框并压缩，未制作虚假产品数据。
- `assets/whale-animated.png` 直接复用控制台已有眨眼 APNG，保留原始动画帧。系统启用“减少动态效果”时由原生 `<picture>` 选择 `assets/whale.jpg` 静态图；`assets/favicon.png` 仍使用静态品牌图标。
- Inter 5.3.0 来自控制台已安装的字体包，随包保留 SIL OFL。内联 Lucide 图标来自控制台已安装的 1.37.0，保留 ISC 授权。
- `_headers` 由 Pages 自动应用；CSP 只允许本站素材。添加外部服务时需要同步检查该策略。
- `dist/` 是可重建产物，`.wrangler/` 是本地部署缓存，均由仓库 `.gitignore` 排除。构建采用白名单，不发布 CLAUDE 地图或内部部署文件。
