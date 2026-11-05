<!--
[INPUT]: 依赖官网静态文件、Node 标准库构建和 Cloudflare Pages 发布约定。
[OUTPUT]: 提供线上地址、本地预览、Git 自动部署、直接上传与素材维护说明。
[POS]: 官网维护和发布入口；OwnDsh 控制面仍遵循根 README 的 Docker Compose 部署。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->
# OwnDsh 官网

纯 HTML + CSS + JavaScript，零第三方构建依赖。字体子集内嵌于 styles.css，除下载菜单对 api.github.com 的 releases/latest 查询外不依赖任何外部服务。官网部署与 OwnDsh 控制面服务独立。

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

- 文案与安装命令以根 `README.md` 为准；官网不写阶段、通道与版本状态，跟随发版现状更新。
- 设计为瑞士风单页，零截图零照片：hero 几何与治理拓扑为内联 SVG，下载入口为两处同构的三平台弹出菜单（`script.js` 平台识别置顶推荐 + GitHub releases/latest 接管，HTML 钉住版本兜底；owndsh-desktop 发新版时同步 `index.html` 两处菜单 href）。
- 字体为 Inter / Noto Sans SC / JetBrains Mono 的按文子集（woff2 data: URI，SIL OFL 1.1），授权见 `assets/OFL-LICENSE.txt`；大改 `index.html` 文案后如出现缺字，用歸藏 gz-fonts 流程重生成字体块回贴 `styles.css`。
- SEO：`robots.txt`、`sitemap.xml`、canonical/og:image（`assets/og.png` 1200×630）与 SoftwareApplication JSON-LD 已就位；部署后在 [Google Search Console](https://search.google.com/search-console) 添加资源 `owndsh.1024300.xyz` 并提交 `sitemap.xml`，可显著加快收录。
- `_headers` 由 Pages 自动应用；CSP 保持 script/style 同源严格，放行 `data:` 字体与 `connect-src https://api.github.com`。添加外部服务时需要同步检查该策略。
- `dist/` 是可重建产物，`.wrangler/` 是本地部署缓存，均由仓库 `.gitignore` 排除。构建采用白名单，不发布 CLAUDE 地图或内部部署文件。
