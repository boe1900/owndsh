# deployment/

> L2 | 父级: ../../../../../../CLAUDE.md

成员清单

DeploymentBootstrapConfiguration.java: 仅在 deploy profile 装配启动 runner，把 Flyway 后的一次性管理员事务接入 Spring Boot readiness 生命周期。
DeploymentBootstrapProperties.java: 绑定 bootstrap 用户名和密码环境变量；是否必填由数据库初始化标记决定，防止重启重复创建管理员。
DeploymentBootstrapService.java: 使用 PostgreSQL transaction advisory lock 接受任意非空初始密码，原子创建唯一 LOCAL enterprise_admin、设置首次安全改密并写无 secret 完成标记。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
