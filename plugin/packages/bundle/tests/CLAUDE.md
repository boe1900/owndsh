# tests/
> L2 | 父级: ../CLAUDE.md

成员清单

bundle.spec.ts: 验证安装配置、dsh.bundle/dsh.client、credentials/pi-ai/远控/systemPrompt 注入及构建产物一致性、兼容 peers 与设置/账号入口/门禁的 Client apply。
mcp-oauth.spec.ts: 验证官方 StoredOAuth* 持久化、discovery/issuer/iss 绑定、失效与取消生命周期。
mcp-pi-search.spec.ts: 验证英文 tokenizer、schema 文档、BM25 排名和曝光覆写优先级。
mcp-runtime.spec.ts: 验证 Pi 风格曝光、英文 tool_search、Agent 隔离、下一轮 assembly、本步未声明与定义替换的拒执行分类、scoped executor，以及闲置租约同一步恢复和持续失效拒执行。
remote-carrier.spec.ts: 验证跨帧二进制原样传输、取消与在途帧交错、有界流和文件路径准入。
remote-ego.spec.ts: 验证能力三方门禁、watcher 私有化/限额/幂等回收、start 关闭竞态、输入释放及在途撤权。
remote-key.spec.ts: 验证重启复用、公钥与私钥一致、用户/平台/installation隔离和损坏记录拒绝。
remote-native-carrier.spec.ts: 验证独立API cookie只留Host、HTTP/WS共用Peer、远端插件库存准入与通用设置隔离、取消流回收、慢消费心跳与有界队列关闭。
remote-navigation-boundary.spec.ts: 真实 HTTP/WS 验证 25 个插件/市场/任务 RPC 字节不变且只转发一次、同一 owner 事件、两条插件图片 GET/query/body 门禁和设置/凭据/版本豁免拒绝。
remote-network-boundary.spec.ts: 验证平台 Origin/Bearer Upgrade、Markdown 字节与 GET/HEAD/query 边界、原生团队开关及管理接口拒绝、文件与 Office RPC 方法绑定、搜索 scope、rc.3子Agent中断、媒体版本重定向约束与 baseFile 语义隔离。
remote-runtime.spec.ts: 验证登录、刷新、退出、设备撤销和销毁都同步到 Remote presence。
remote-secure-link.spec.ts: 验证握手+租约+同版 ready 前拒绝业务、认证旧 Host 的明确版本拒绝、完整加密HTTP/mux、撤权及过期关门、旧socket隔离。
remote-view-registry.spec.ts: 验证重连先释放旧链路、失败保留目标、新 view 不重用 URL，以及占用的固定 HTTP 错误投影。
remote-workspace-runtime.spec.ts: 验证默认关闭、显式开启、稳定公钥、关闭只影响Host、分页完整性及建链拒绝原因保留。
skill-provider.spec.ts: 验证 OwnDsh provider 只挂载 enterprise/skills、能与 standard/ptc 官方 preset filesystem provider 共存并按 scope 裁决同名 skill，且变更由官方 watcher 失效。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
