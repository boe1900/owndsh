# ruoyi-common-web/

> L2 | 父级: ../../CLAUDE.md

成员清单

.flattened-pom.xml: Maven flatten 生成的发布 POM 快照，不作为手工依赖真源。
pom.xml: Spring MVC/Jetty、JSON、验证码与 crypto 公共 Web 依赖边界，测试使用 Spring mock Servlet。
src/main/java/org/dromara/common/web/advice/ResponseEnhancementAdvice.java: 统一响应增强入口。
src/main/java/org/dromara/common/web/config/: Web 自动配置、默认拒绝跨域的 CORS、过滤器、验证码、国际化和拦截器注册。
src/main/java/org/dromara/common/web/core/: 基础 Controller、locale 解析与验证码实现。
src/main/java/org/dromara/common/web/filter/: 重复读请求、XSS 与 Servlet wrapper 边界。
src/main/java/org/dromara/common/web/handler/GlobalExceptionHandler.java: 通用 Spring MVC 异常到响应的映射入口。
src/main/java/org/dromara/common/web/interceptor/PlusWebInvokeTimeInterceptor.java: 统一 URL/耗时日志，企业 API 省略请求参数并删除其他接口认证参数。
src/test/java/org/dromara/common/web/interceptor/PlusWebInvokeTimeInterceptorTest.java: 企业正文省略与认证参数清洗回归门禁。
src/test/java/org/dromara/common/web/config/ResourcesConfigCorsTest.java: 真实 CorsFilter 的默认拒绝、同源放行与精确 origin 授权门禁。
src/test/java/org/dromara/common/web/config/GracefulShutdownIntegrationTest.java: 真实 Jetty 随机端口上的已接受慢请求 drain 验收。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
