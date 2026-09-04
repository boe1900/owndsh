# deploy/

> L2 | 父级: ../CLAUDE.md

成员清单

README.md: 单机 Linux amd64 运维真源，定义安装输入、TLS、员工 profile、备份恢复、升级和仅应用回滚边界。
compose/: 四服务生产拓扑、首次 bootstrap overlay 与 Server/Console 多阶段镜像；局部地图见 compose/CLAUDE.md。
nginx/: TLS 同源入口和可信 forwarding header 清洗；局部地图见 nginx/CLAUDE.md。
scripts/: 发布包构建、安装、备份、恢复、升级和回滚事务；局部地图见 scripts/CLAUDE.md。
tests/: 不依赖生产 secret 的部署静态与容器配置门禁；局部地图见 tests/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
