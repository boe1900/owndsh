# test/

> L2 | 父级: ../../CLAUDE.md

成员清单

java/com/owndsh/test/AssertUnitTest.java: Host 上游断言示例测试，随锁定源码基线保留。
java/com/owndsh/test/DemoUnitTest.java: Host 上游 JUnit 基础示例，随锁定源码基线保留。
java/com/owndsh/test/EnterpriseContractSchemaTest.java: 遍历 OpenAPI 生成的全部 manifest 条目，以 Draft 2020-12 schema 验证与 TypeScript 相同的正反 fixture，避免协议扩展与手工计数耦合。
java/com/owndsh/test/EnterpriseSafetyDefaultsTest.java: 结构化读取唯一 application.yml，验证请求上限、graceful drain、同源 CORS，以及 PostgreSQL/Redis/JWT/master/signing key 环境入口。
java/com/owndsh/common/security/config/SecurityConfigEnterpriseRouteTest.java: 锁定企业路由下沉领域 context、非企业路由保留全局 Sa-Token 登录校验的边界。
java/com/owndsh/test/ParamUnitTest.java: Host 上游参数化测试示例，随锁定源码基线保留。
java/com/owndsh/test/OwnDshCaptchaVerifierTest.java: 验证 LOCAL 登录复用 Host captcha 开关、生成端默认 Redis codec、全局 key、GETDEL 单消费与失败记录。
java/com/owndsh/test/SaTokenSecretLoggingTest.java: 用携带受控 JWT 的真实 Sa-Token 异常验证全局 401/403 日志不记录 message、stack 或 Token。
java/com/owndsh/test/SaTokenDeviceSessionTest.java: T01 Sa-Token `deviceType/deviceId`、`is-share=false` 与单 Token 注销隔离验收。
java/com/owndsh/web/enterprise/OwnDshPlatformSessionGatewayTest.java: 以真实 Sa-Token 1.45 和 mock Refresh Store 验证管理 Cookie、Access/Refresh logout、设备撤销、成员 kickout 与终端隔离。
java/com/owndsh/test/TagUnitTest.java: Host 上游 Tag 筛选示例测试，随锁定源码基线保留。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
