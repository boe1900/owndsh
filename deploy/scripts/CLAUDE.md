# scripts/

> L2 | 父级: ../CLAUDE.md

成员清单

common.sh: 提供校验、release/runtime 环境、临时凭据注入、master key 备份指纹、操作锁与健康等待。
build-release.sh: 以锁定 digest 构建 `owndsh/server` 与 `owndsh/console`，允许显式 registry 前缀或经 RepoDigest 反查验证的本地缓存，并从 Harness 机器锁生成 manifest 后将 Flyway 全部迁移随 Server 镜像交付，并打包企业 bundle、许可证、运维文档和校验和。
install.sh: 校验安装参数，生成平台运行密钥，加载镜像、初始化管理员并生成仅 Server 地址的员工 overlay。
backup.sh: 导出 PostgreSQL/Redis 与非秘密运行元数据，master key 独立归档。
restore.sh: 恢复数据库、master key 与 Redis RDB/AOF，启动同一应用拓扑并检查健康。
upgrade.sh: 先备份，再加载新 release、同步待分发 Harness bundle 并启动新 Server/Console；保留安装专属 overlay 和旧应用引用供回滚。
rollback.sh: 回滚应用 release 引用，核对数据库/Redis 卷与 master key；不回滚数据库 schema。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
