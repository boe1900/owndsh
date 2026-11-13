# scripts/

> L2 | 父级: ../CLAUDE.md

成员清单

generate-openapi.mjs: 从仓库 OpenAPI YAML 真源生成控制台 DTO、Fetch client 和强类型 operation，隔离旧 Umi 请求层与中间 bundle。
build-native-workspace.mjs: 启动独立 rc.3 构建 Host，冻结 Web assembly、导出 package assets 与资源和启动 metadata；源码 hash 与 shell 恰好一次命中门禁保护启动失败、图片读取和文件 intake 接缝，HTML 保留官方配置与隔离预览，保留底层配置/上传服务和附件栏；成功后清除旧资源，回收时识别退出码和退出信号，保留原始失败并清理凭据，生产不运行本机 Host；原生 sidebar 不做源码改写，品牌按钮保留新会话语义。

ego-client.mjs: 精确 Ego 客户端 hash 门禁和 factory 局部网络接缝；无能力时不挂面板，构建时移除配置、登录桥及打开本机窗口控件，复用原生鼠标坐标和 IME。
ego-client.test.mjs: 使用固定第三方客户端的实际注册面板与真实 React 渲染器，验证裁剪后能渲染且无本机登录入口。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
