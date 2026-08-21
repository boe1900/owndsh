# test/

> L2 | 父级: ../../CLAUDE.md

成员清单

java/org/dromara/test/AssertUnitTest.java: RuoYi 上游断言示例测试，随锁定源码基线保留。
java/org/dromara/test/DemoUnitTest.java: RuoYi 上游 JUnit 基础示例，随锁定源码基线保留。
java/org/dromara/test/EnterpriseContractSchemaTest.java: 遍历 OpenAPI 生成的全部 manifest 条目，以 Draft 2020-12 schema 验证与 TypeScript 相同的正反 fixture，避免协议扩展与手工计数耦合。
java/org/dromara/test/EnterpriseSafetyDefaultsTest.java: 结构化读取 application.yml，验证分层请求上限、graceful drain、同源 CORS、Session 1 MiB 与强制外部 JWT secret。
java/org/dromara/common/security/config/SecurityConfigEnterpriseRouteTest.java: 锁定企业路由下沉领域 context、非企业路由保留全局 Sa-Token 登录校验的边界。
java/org/dromara/test/ParamUnitTest.java: RuoYi 上游参数化测试示例，随锁定源码基线保留。
java/org/dromara/test/RuoYiCaptchaVerifierTest.java: 验证 LOCAL 登录复用 RuoYi captcha 开关、生成端默认 Redis codec、全局 key、GETDEL 单消费与失败记录。
java/org/dromara/test/SaTokenSecretLoggingTest.java: 用携带受控 JWT 的真实 Sa-Token 异常验证全局 401/403 日志不记录 message、stack 或 Token。
java/org/dromara/test/SaTokenDeviceSessionTest.java: T01 Sa-Token `deviceType/deviceId`、`is-share=false` 与单 Token 注销隔离验收。
java/org/dromara/web/enterprise/RuoYiPlatformSessionGatewayTest.java: 以真实 Sa-Token 1.45 内存 DAO 验证设备撤销标记、精确 kickout、另一设备隔离及普通 kickout 不误判。
java/org/dromara/test/TagUnitTest.java: RuoYi 上游 Tag 筛选示例测试，随锁定源码基线保留。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
