# OwnDsh Server

OwnDsh Server 是产品的 Java 21 / Spring Boot 4.1 模块化后端，负责企业身份、成员与用户组、受管模型、访问授权、Token 配额、速率限制、插件分发和审计。

## 模块

- `owndsh-server/`：唯一 Spring Boot 启动与生产装配模块，输出 `owndsh-server.jar`。
- `owndsh-modules/owndsh-enterprise/`：OwnDsh 治理领域、API、PostgreSQL 与 Redis 实现。
- `owndsh-api/`、`owndsh-common/`、`owndsh-modules/owndsh-system/`：OwnDsh 共享 API、基础设施和基础系统模块。

## 构建

```sh
./mvnw -B -ntp -Pprod -DskipTests -pl owndsh-server -am package
```

产物位于 `owndsh-server/target/owndsh-server.jar`。

## 测试

```sh
./mvnw -B -ntp -pl owndsh-modules/owndsh-enterprise,owndsh-server -am test \
  -Dmaven.test.skip=false -DskipTests=false
```

企业模块只支持 PostgreSQL，集成测试会使用 Testcontainers 装载 `script/sql/postgres/postgres_owndsh.sql` 后执行 Flyway migration。

OwnDsh Server 由本项目自主维护，第三方代码的 MIT 许可证保留在 `LICENSE`。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
