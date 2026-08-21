# scripts/

> L2 | 父级: ../CLAUDE.md

成员清单

common.sh: 集中提供 GNU sha256sum/macOS shasum 兼容层、单行环境值约束、release 校验、runtime.env 原子更新、Compose 调用、操作锁和健康等待，不持有业务 secret。
build-release.sh: 以锁定 digest 构建 Server/Gateway，允许显式 registry 前缀或经 RepoDigest 反查验证的本地缓存，并打包 PostgreSQL 基线、Harness bundle、许可证、运维文档和校验和。
install.sh: 以无注入且发布端口一致的 HTTPS authority/固定回调和隔离 Compose project 校验全新主机输入，生成安装 secret、加载镜像、用临时 overlay 创建唯一管理员、移除 bootstrap 副本并验证 HTTPS。
backup.sh: 在线导出 PostgreSQL/Redis/artifact 数据，并把 master/signing key 强制写入独立归档目录。
restore.sh: 校验数据与 key 归档后恢复数据库、artifact 和关键密钥，并用隔离 Redis 进程把 RDB 转换为完整 AOF，再等待同一应用拓扑健康。
upgrade.sh: 先备份，再加载新 release 并启动新 Server/Gateway；保留旧应用镜像引用供回滚。
rollback.sh: 只恢复上一组 Server/Gateway 镜像引用，显式证明数据库卷、Redis 卷、artifact 卷与 key 指纹未变。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
