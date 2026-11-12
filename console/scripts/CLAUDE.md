# scripts/

> L2 | 父级: ../CLAUDE.md

成员清单

generate-openapi.mjs: 从仓库 OpenAPI YAML 真源生成控制台 DTO、Fetch client 和强类型 operation，隔离旧 Umi 请求层与中间 bundle。
build-native-workspace.mjs: 启动独立 rc.5 构建 Host，冻结 Web assembly、资源和启动 metadata；源码 hash 门禁保护启动失败、图片读取和文件 intake 接缝，HTML 保留官方配置与隔离预览，保留底层配置/上传服务和附件栏；成功后按资源表清除旧文件，关闭构建 Host 并清理凭据，生产不运行本机 Host；原生 sidebar 不做源码改写，品牌按钮保留新会话语义。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
