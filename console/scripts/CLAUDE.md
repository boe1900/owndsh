# scripts/

> L2 | 父级: ../CLAUDE.md

成员清单

generate-openapi.mjs: 从仓库 OpenAPI YAML 真源生成控制台 DTO、Fetch client 和强类型 operation，隔离旧 Umi 请求层与中间 bundle。
build-native-workspace.mjs: 启动独立 rc.3 构建 Host，冻结 Web assembly、导出 package assets 与资源和启动 metadata；源码 hash 与唯一命中门禁保护启动失败、图片读取、文件 intake 和 Markdown 复制接缝，HTML 保留官方配置与隔离预览；成功后清除旧资源，回收时保留退出原因并清理凭据，生产不运行本机 Host；品牌按钮保留新会话语义；Plugins、Discover、自动化任务及预设选择/会话模式标识使用官方静态模块并受构建图完整性断言保护。

ego-client.mjs: 精确 Ego 客户端 hash 门禁和 factory 局部网络接缝；无能力时不挂面板，构建时移除配置、登录桥及打开本机窗口控件，复用原生鼠标坐标和 IME。
ego-client.test.mjs: 使用固定第三方客户端的实际注册面板与真实 React 渲染器，验证裁剪后能渲染且无本机登录入口。
entry-customization-client.test.mjs: 直接执行官方原字节并渲染三处实际注册菜单，验证打开、固定、浏览插件及 Creator 的区域提示词、草稿参数和菜单关闭行为。
session-markdown-client.mjs: 固定官方会话导出客户端 hash，只向复制控制器注入原生密文 transport，验证成功响应为 Markdown，保留官方剪贴板与失败反馈。
session-markdown-client.test.mjs: 执行官方菜单注册的真实复制动作，验证 Markdown 字节、HTTP fallback、同步启动 deferred write、重复点击合并及错误响应拒绝。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
