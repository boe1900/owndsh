# remote/

> L2 | 父级: ../CLAUDE.md

成员清单

close-codes.json: Remote v1 关闭码与终止原因集合，供 Java 与 TypeScript 统一解释链路结束状态。
control-frame.schema.json: WebSocket control frame JSON Schema，约束 hello、welcome、ping、close 与错误帧。
crypto-vectors.json: MIT noise-c 独立公开的完整两消息 Noise IK 与四条 transport 密文向量，保留来源；不使用自生成向量证明标准互操作。
limits.json: Remote v1 帧大小、fragment、lease 与超时上限，供各端边界校验复用。
relay-frame.schema.json: Relay 数据帧 JSON Schema，约束 link、方向、序列号与载荷编码。
rpc-envelope.schema.json: 加密 RPC envelope JSON Schema，约束 nonce、counter、密文与关联 ID。
fixtures/: 协议正反 fixture 与清单，供 Java、TypeScript 和 CI 做跨端兼容回归；局部地图见 fixtures/CLAUDE.md。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
