# compose/

> L2 | 父级: ../CLAUDE.md

成员清单

compose.yml: 空卷通过官方 initdb 装载受检 RuoYi version 0 基线，仅 Gateway 发布 443；registry 可替换但数据组件 digest 固定，并声明健康依赖、secret 与持久卷。
compose.bootstrap.yml: 只在空库首次启动叠加管理员用户名和密码 secret，marker 成功后从常规生命周期移除。
Dockerfile.server: Maven/JRE 双阶段 Linux amd64 Server 镜像，registry 可替换但 digest 不可漂移，生产 profile、非 root 运行并提供内部健康检查。
Dockerfile.gateway: Node/Nginx 双阶段管理端 Gateway 镜像，显式复制唯一 OpenAPI 真源，registry 可替换但 digest 不可漂移，并把 TLS 代理配置与静态资源封装为一个应用制品。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
