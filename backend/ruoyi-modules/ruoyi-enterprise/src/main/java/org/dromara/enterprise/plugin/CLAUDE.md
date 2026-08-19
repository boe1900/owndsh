# plugin/

> L2 | 父级: ../../../../../../../CLAUDE.md

成员清单

EnterprisePluginConfiguration.java: 插件服务端 composition root，装配归档检查、Ed25519、CAS 制品库、JDBC ports 和事务服务。
EnterprisePluginProperties.java: artifact root、PKCS#8 私钥文件与三项归档上限的部署配置边界。
artifact/: 不信任 tgz 的流式校验、RFC 8785 签名声明和内容寻址文件存储；局部地图见 artifact/CLAUDE.md。
domain/: package/version/assignment/compatibility/inventory 的不可变领域事实与封闭状态机；局部地图见 domain/CLAUDE.md。
application/: 上传、发布、退休、分配、生效解析、下载授权和库存替换事务编排；局部地图见 application/CLAUDE.md。
persistence/: 插件 V2/V8 表的 PostgreSQL adapters 和优先级解析查询；局部地图见 persistence/CLAUDE.md。
web/: 管理与 runtime Controller、严格 DTO、Range 下载和安全投影；局部地图见 web/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
