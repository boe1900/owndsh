# fixtures/

> L2 | 父级: ../CLAUDE.md

成员清单

candidate-services.mjs: 原生 Node HTTPS 固定 OIDC Authorization Code + S256/RS256 IdP 与 DeepSeek-compatible SSE upstream，共享单进程但保持路由和状态隔离。
candidate-auditor.sql: T22 migration seed，在隔离正式安装中复制初始化密码 hash 并预置仅有固定 auditor 角色的独立验收账号，不进入 release migration。
compose.yml: 锁定 Node/OpenLDAP digest 的候选外部系统拓扑，只发布测试端口并挂载只读 LDIF、证书与私钥输入。
compose.release.yml: 在正式 release Compose 上仅叠加 fixture 宿主解析、确定性关闭验证码和 JSSE 无密码加载的只读 JKS CA，不复制生产拓扑、注入 truststore 密码或放宽 OIDC HTTPS 边界。
fixtures.test.mjs: 静态门禁，验证镜像锁、OIDC/DeepSeek 协议面、LDAP 双用户、双版本插件及其官方 package-name Loader 入口不漂移。
ldap/: OpenLDAP 初始化数据模块；局部地图见 `ldap/CLAUDE.md`。
plugins/: 候选受管插件的两个可重现版本；局部地图见 `plugins/CLAUDE.md`。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
