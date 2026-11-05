# website/

> L2 | 父级: ../CLAUDE.md

成员清单

index.html: 中文官网语义入口——瑞士风单页（hero 三平台下载菜单、两个使用面、七入口能力、请求旅程与治理边界、部署指引、FAQ），零截图零外部素材；文案原则：功能与使用视角优先，不含会过时的阶段/通道/版本表述（设计迭代见 git 历史与歸藏作品库）；favicon 走 assets/ 相对路径。SEO：canonical/og:url 固定 https://owndsh.1024300.xyz/，og:image 指向 assets/og.png（1200×630，由 hero 同款临时页经歸藏 export.mjs 渲染重生成），SoftwareApplication JSON-LD 描述 DSH 关键词。
styles.css: 唯一样式真源：设计 token（歸藏品牌主题 #c2f970 收敛色阶）+ 全部版式组件 + gz-fonts 生成的 Inter/Noto Sans SC/JetBrains Mono 子集（woff2 data: URI）；深色模式为 prefers-color-scheme 纯 CSS token 覆盖组（零 JS、无手动开关），内联 SVG 颜色一律 currentColor/var，CTA 带固定黑底不随主题反转；改 index.html 文案后如缺字，用歸藏 gz-fonts.mjs embed 流程按可见文字重生成字体块并回贴本文件。
script.js: 官网唯一脚本：两处同构三平台下载菜单开关、平台识别置顶推荐（UAData 高熵架构 → WebGL 渲染器兜底）与 GitHub releases/latest 接管（[data-os] 双位置同步，失败静默回退 HTML 钉住版本）；无 JS 时按钮退化为 Releases 页外链。下载直链发新版时同步 index.html 两处菜单的 href。
build.mjs: Node 标准库白名单发布器，只将公开页面、样式、脚本、响应头与静态素材写入 dist，排除 CLAUDE 地图与内部文件。
site.test.mjs: Node 原生测试，验证发布文件白名单（index/404/styles/script/_headers/robots.txt/sitemap.xml/assets[OFL-LICENSE.txt, favicon.png, og.png]）、清除旧产物和独立构建。
package.json: 无第三方依赖的 build/test 命令入口，Cloudflare Pages 只需 Node 22 或更新版本。
_headers: Cloudflare Pages 静态响应头；CSP 保持 script/style 同源严格，放行 data: 字体与 connect-src api.github.com（下载最新版接管），新增外部服务时同步检查。
404.html: 新设计语言错误页（styles.css token + favicon），返回首页入口；使 Pages 对未知地址返回真实 404。
README.md: 官网域名与 Pages 项目映射、本地预览、部署路径与素材维护说明；owndsh 项目以直接上传更新生产环境。
robots.txt / sitemap.xml: 收录基建——允许全部抓取并指向单页站点地图（域名 owndsh.1024300.xyz），随白名单发布；二者为公开边缘产物，文件内不带任何行内注释，维护说明以本条为唯一真源。
assets/: favicon.png、og.png 与 OFL-LICENSE.txt，详见 assets/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
