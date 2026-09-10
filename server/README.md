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

企业模块只支持 PostgreSQL。数据库与账号由 PostgreSQL/DBA 创建，应用账号需拥有目标数据库的 `public` schema 及应用对象，能够执行 DDL，无需超级用户权限。Server 启动时从镜像内执行 Flyway `V0` 基础建表/种子数据及后续迁移，随后由 deploy profile 的 bootstrap 创建初始管理员。集成测试同样从非超级用户持有的空库执行全部 migration。

PostgreSQL JDBC 使用 `stringtype=unspecified`，使字符串参数按目标字段推断类型，替代旧 initdb 脚本要求超级用户创建的全库隐式时间转换。

OwnDsh Server 由本项目自主维护，第三方代码的 MIT 许可证保留在 `LICENSE`。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
