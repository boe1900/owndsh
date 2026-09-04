# OwnDsh Server

OwnDsh Server 是产品的 Java 21 / Spring Boot 4.1 模块化后端，负责企业身份、成员与用户组、受管模型、访问授权、Token 配额、速率限制、插件分发和审计。

## 模块

- `owndsh-server/`：唯一 Spring Boot 启动与生产装配模块，输出 `owndsh-server.jar`。
- `ruoyi-modules/owndsh-enterprise/`：OwnDsh 治理领域、API、PostgreSQL 与 Redis 实现。
- `ruoyi-api/`、`ruoyi-common/`、`ruoyi-modules/ruoyi-system/`：保留的第三方宿主框架模块；名称属于内部 Maven 兼容面，不作为 OwnDsh 产品品牌。

## 构建

```sh
./mvnw -B -ntp -Pprod -DskipTests -pl owndsh-server -am package
```

产物位于 `owndsh-server/target/owndsh-server.jar`。

## 测试

```sh
./mvnw -B -ntp -pl ruoyi-modules/owndsh-enterprise,owndsh-server -am test \
  -Dmaven.test.skip=false -DskipTests=false
```

企业模块只支持 PostgreSQL，集成测试会使用 Testcontainers 装载 `script/sql/postgres/postgres_owndsh.sql` 后执行 Flyway migration。

第三方框架的精确来源记录在 `../upstream/server-framework.lock.json`，许可证保留在 `LICENSE`。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
