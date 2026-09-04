# scripts/

> L2 | 父级: ../CLAUDE.md

成员清单

common.sh: 集中提供 SHA-256、单行环境值约束、release 校验、runtime.env 原子更新、从离线 key 文件临时注入 Compose 环境变量、操作锁和健康等待。
build-release.sh: 以锁定 digest 构建 `owndsh/server` 与 `owndsh/console`，允许显式 registry 前缀或经 RepoDigest 反查验证的本地缓存，并从 Harness 机器锁生成 manifest 后打包 PostgreSQL 基线、企业 bundle、许可证、运维文档和校验和。
install.sh: 校验外部 authority/回调/端口/Compose project，生成随机运行密钥、加载镜像，并通过单一 Compose 拓扑创建唯一管理员和验证 HTTP 健康。
backup.sh: 在线导出 PostgreSQL/Redis/artifact 数据，并把 master/signing key 强制写入独立归档目录。
restore.sh: 校验数据与 key 归档后恢复数据库、artifact 和关键密钥，并用隔离 Redis 进程把 RDB 转换为完整 AOF，再等待同一应用拓扑健康。
upgrade.sh: 先备份，再加载新 release、同步待分发 Harness bundle 并启动新 Server/Console；保留安装专属 overlay 和旧应用引用供回滚。
rollback.sh: 恢复上一 release 的 Compose 指针、Server/Console 镜像与待分发 Harness bundle，使同一新版可再次前滚，并显式证明数据库卷、Redis 卷、artifact 卷与 key 指纹未变。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
