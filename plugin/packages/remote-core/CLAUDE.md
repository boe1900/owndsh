# remote-core/

> L2 | 父级: ../CLAUDE.md

成员清单

package.json: 无框架 Remote core，使用 MIT clatterjs 完整标准 Noise IK、noble X25519 与 Zod 边界校验。
src/index.ts: 共享 facade 与既有 fragment、counter、lease 和 transport 纯逻辑，导出 Noise 与 carrier 模块。
src/noise.ts: 固定 Noise_IK_25519_ChaChaPoly_SHA256 双消息握手，验证双方静态公钥；JSON prologue 绑定 link、设备与公钥，transport 严格递增计数且单帧含 AEAD 不超过 65536 字节。关闭清零自有密钥并释放提供者，clatterjs 没有内部派生密钥擦除 API。
src/carrier.ts: 密文内的 HTTP/mux 帧语法与字节信用，每片 24576 字节、每流窗口 98304 字节、最多 32 通道、mux 单消息最多 4 MiB；消费后才返回信用。
tests/remote-core.spec.ts: fragment/reassembly、counter、lease 与稳定协议常量的行为回归。
tests/noise.spec.ts: noise-c 独立公开向量的两条握手和四条 transport 密文逐字节验证，以及错误序列、prologue、篡改、重放和 canonical key 拒绝。
../../contracts/remote/crypto-vectors.json: 测试直接消费协议真源中的 MIT noise-c 公开互操作向量，不保存第二份副本。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
