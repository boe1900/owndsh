# remote-core/

> L2 | 父级: ../CLAUDE.md

成员清单

tsconfig.json: 严格 NodeNext 编译纯浏览器兼容源码，不隐式加载 Node 全局类型，支持 Console 独立工作区构建。

package.json: 无框架 Remote core，使用 MIT clatterjs 完整标准 Noise IK、noble X25519 与 Zod 边界校验。
src/index.ts: 共享 facade 与既有 fragment、counter、lease 和 transport 纯逻辑，导出 Noise、carrier、完整安全 link/tunnel 与平台适配契约。
src/noise.ts: 固定 Noise_IK_25519_ChaChaPoly_SHA256 双消息握手，验证双方静态公钥；JSON prologue 绑定 link、设备与公钥，transport 严格递增计数且单帧含 AEAD 不超过 65536 字节。关闭清零自有密钥并释放提供者，clatterjs 没有内部派生密钥擦除 API。
src/secure-link.ts: Host/浏览器共用的 Noise IK、租约截止时间与 carrier ready 状态机，通过结构化 connection 边界发送帧，不依赖 Node Buffer 或原生 socket。
src/carrier-tunnel.ts: HTTP 流与原生文本 mux 的共享字节信用隧道，保留取消、流上限和有界文本重组，不解释业务结果或重试 mutation。
src/carrier-types.ts: 共享 HTTP/mux 接口、请求路径和头部边界、标准 base64 与 HTTP 环境可用 UUID；文件准入仍留 Host。
src/carrier.ts: 密文内的 HTTP/mux 帧语法与字节信用，每片 24576 字节、每流窗口 98304 字节、最多 32 通道、mux 单消息最多 4 MiB；消费后才返回信用。
tests/remote-core.spec.ts: fragment/reassembly、counter、lease 与稳定协议常量的行为回归。
tests/noise.spec.ts: noise-c 独立公开向量的两条握手和四条 transport 密文逐字节验证，以及错误序列、prologue、篡改、重放和 canonical key 拒绝。
../../contracts/remote/crypto-vectors.json: 测试直接消费协议真源中的 MIT noise-c 公开互操作向量，不保存第二份副本。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
