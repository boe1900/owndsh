# website/

> L2 | 父级: ../CLAUDE.md

成员清单

index.html: 中文公开官网的语义入口，围绕真实产品截图、治理边界、产品问答与 README 已验证的安装命令组织内容，官网部署方式仅留在维护 README；首屏原生播放品牌 APNG，并为 reduced-motion 选择静态图；内联图标来自控制台已使用的 Lucide。
styles.css: 官网独立黑白与亮绿视觉、响应式排版、焦点和 reduced-motion 状态，不引入产品控制台样式或运行时。
script.js: 渐进增强移动导航、截图切换、安装方式切换和命令复制；内容和安装命令在无 JavaScript 时仍可阅读。
build.mjs: Node 标准库白名单发布器，只将公开页面、样式、脚本、响应头与静态素材写入 dist，排除源码地图和部署文档。
site.test.mjs: Node 原生测试，验证发布文件白名单、清除旧产物和独立构建，防止将仓库内部文件上传到官网。
package.json: 无第三方依赖的 build/test 命令入口，Cloudflare Pages 只需 Node 22 或更新版本。
_headers: Cloudflare Pages 静态响应头，限制本站资源来源、禁止嵌入并启用 MIME 检查。
404.html: 独立错误页，沿用官网样式并提供主页入口；使 Pages 对未知地址返回真实 404。
README.md: 官网域名与现有 Pages 项目映射、本地预览、Git/直接上传部署路径和资产来源；当前 owndsh 项目以直接上传更新生产环境。
assets/: 本地品牌、真实界面截图与 Inter 字体发布副本，详见 assets/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
