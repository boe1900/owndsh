# compose/

> L2 | 父级: ../CLAUDE.md

成员清单

compose.yml: GHCR Server/Console 与锁定 PostgreSQL/Redis；仅 Console 暴露端口，仅数据库和 Redis 持久化，无插件存储服务或签名 secret。
Dockerfile.server: Alpine Maven/Jammy glibc JRE 双阶段 Linux amd64 Server 镜像，默认 registry 与受验本地 RepoDigest 共用不可漂移的镜像参数，规避 musl AWT 原生崩溃并以非 root 运行生产 profile，应用日志仅输出标准流，不创建日志目录。
Dockerfile.console: Node/Nginx 双阶段产品 Console 镜像，使用 console 的 pnpm 11 锁和完整 OpenAPI 真源生成 TanStack 控制台，构建期执行 Nginx 语法校验后与 HTTP 代理配置封装为唯一对外制品。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
