# compose/

> L2 | 父级: ../CLAUDE.md

成员清单

compose.yml: 空卷通过官方 initdb 装载受检 RuoYi version 0 基线，仅 Gateway 发布 443；Server 将 Fontconfig 缓存定向到已有 `/tmp` tmpfs，registry 可替换但数据组件 digest 固定，并声明健康依赖、secret 与持久卷。
compose.bootstrap.yml: 只在空库首次启动叠加管理员用户名和密码 secret，marker 成功后从常规生命周期移除。
Dockerfile.server: Alpine Maven/Jammy glibc JRE 双阶段 Linux amd64 Server 镜像，默认 registry 与受验本地 RepoDigest 共用不可漂移的镜像参数，规避 musl AWT 原生崩溃并以非 root 运行生产 profile。
Dockerfile.gateway: Node/Nginx 双阶段管理端 Gateway 镜像，默认 registry 与受验本地 RepoDigest 共用不可漂移的镜像参数，并把唯一 OpenAPI 真源、TLS 代理配置与静态资源封装为一个应用制品。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
