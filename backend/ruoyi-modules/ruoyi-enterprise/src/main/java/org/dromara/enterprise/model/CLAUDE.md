# model/

> L2 | 父级: ../../../../../../../CLAUDE.md

成员清单

EnterpriseModelConfiguration.java: 受管模型 Spring composition root，装配 JDBC ports、事务服务、无重定向 provider probe 与 bootstrap 查询。
domain/: provider/model/grant 领域聚合、封闭状态枚举和有效授权候选；局部地图见 domain/CLAUDE.md。
application/: 密钥生命周期、CAS/审计事务、默认模型解析与 bootstrap 模型切片；局部地图见 application/CLAUDE.md。
persistence/: V1 模型表和 RuoYi 用户/部门事实的 JDBC adapters；局部地图见 persistence/CLAUDE.md。
web/: 管理 API 与 runtime bootstrap 的严格请求/脱敏响应边界；局部地图见 web/CLAUDE.md。
gateway/: 请求级授权/reasoning 复核、DeepSeek upstream、OpenAI SSE、配额生命周期与双审计纵向边界；局部地图见 gateway/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
