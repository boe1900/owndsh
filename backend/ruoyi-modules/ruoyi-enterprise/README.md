# ruoyi-enterprise

企业治理后端领域模块。T03 提供 PostgreSQL Flyway `V1` 至 `V5`、用途隔离的 AES-256-GCM
秘密加密、bootstrap revision CAS 和只追加审计事务基础设施；后续身份、模型、配额、插件与
Session 任务在这些约束之上增加纵向能力。

## 数据库

本模块只支持 PostgreSQL。Flyway migration 位于 `src/main/resources/db/migration`，假定 RuoYi
PostgreSQL 基线已经存在，并为企业表创建显式外键、检查约束和索引。`V4` 向 `sys_role` 增加
真实的 `built_in` 列并写入固定角色和权限集合；`V5` 为默认 tenant `000000` 写入 LOCAL 身份源、
默认配额策略和 `BOOTSTRAP` revision。

## 测试

测试需要可用的 Docker daemon，并使用本机或自动拉取的 `postgres:17-alpine` 镜像：

```sh
./mvnw -pl ruoyi-modules/ruoyi-enterprise -am test
```

测试从真实 RuoYi PostgreSQL 基线启动数据库，分别验证一次性迁移和逐版本升级；不会使用 H2
模拟 PostgreSQL 约束。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
