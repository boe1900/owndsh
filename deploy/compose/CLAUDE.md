# compose/

> L2 | 父级: ../CLAUDE.md

成员清单

compose.yml: 空卷通过官方 initdb 装载受检上游 version 0 基线，仅 Console 发布 HTTP 8080；Server 将 Fontconfig 缓存定向到已有 `/tmp` tmpfs，registry 可替换但数据组件 digest 固定，并声明健康依赖、secret 与持久卷。
compose.bootstrap.yml: 只在空库首次启动叠加管理员用户名和密码 secret，marker 成功后从常规生命周期移除。
Dockerfile.server: Alpine Maven/Jammy glibc JRE 双阶段 Linux amd64 Server 镜像，默认 registry 与受验本地 RepoDigest 共用不可漂移的镜像参数，规避 musl AWT 原生崩溃并以非 root 运行生产 profile。
Dockerfile.console: Node/Nginx 双阶段产品 Console 镜像，使用 console 的 pnpm 11 锁和完整 OpenAPI 真源生成 TanStack 控制台，并与 HTTP 代理配置封装为唯一对外制品。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
