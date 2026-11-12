# compose/

> L2 | 父级: ../CLAUDE.md

成员清单

compose.yml: 阿里云 ACR Server/Console 与 Docker Hub 锁定 PostgreSQL/Redis；仅 Console 暴露端口，Remote Netty listener 由环境变量控制并通过 Console 同源 Nginx Upgrade 代理，仅数据库和 Redis 持久化，无插件存储服务或签名 secret。
Dockerfile.server: Alpine Maven/Jammy glibc JRE 双阶段 Linux amd64/arm64 Server 镜像，默认 registry 与受验本地 RepoDigest 共用不可漂移的多架构镜像参数，规避 musl AWT 原生崩溃并以非 root 运行生产 profile，应用日志仅输出标准流，不创建日志目录。
Dockerfile.console: Node/Nginx 双阶段 Console 镜像，构建共享 contracts/remote-core 与固定 rc.5 原生 UI，发布双 document 静态资源；构建期校验 HTTP/Remote upstream 并清理 root pid，生产以非 root Nginx 运行，不启动 DSH Host。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
