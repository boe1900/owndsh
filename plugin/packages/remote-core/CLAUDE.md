# remote-core/

> L2 | 父级: ../CLAUDE.md

成员清单

package.json: 无框架 Remote core package，供 Host/Web 共享协议常量、fragment/reassembly、counter 和 lease 状态。
src/index.ts: Remote v1 纯逻辑 exports，包含 Noise IK、transport selection、fragment/reassembly、counter 和 lease；不依赖 Node、React、Netty、WebRTC 或 Typert。
tests/remote-core.spec.ts: fragment、counter、lease 和 Noise 参数的行为回归。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
