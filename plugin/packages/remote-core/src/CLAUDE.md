# src/

> L2 | 父级: ../CLAUDE.md

成员清单

index.ts: 平台无关公开入口，汇总安全 link/carrier/Noise，并保留 fragment、counter 和 lease 纯逻辑。
noise.ts: 双端静态公钥绑定的标准 Noise IK 会话，限制握手顺序、计数与密文帧尺寸，关闭时释放密钥所有者。
carrier.ts: 密文内 HTTP/mux 帧及逐流字节信用；ready 分别携带 DSH 应用版本和 OwnDsh carrier 修订号。
carrier-types.ts: Host/Controller 共用的 HTTP/mux 端口、路径和头部边界及 base64；不决定文件授权。
carrier-tunnel.ts: 把 HTTP 流和原生文本 mux 映射为有界 carrier 通道，通过同一 link 打开大消息读取通道。
mux-transfer.ts: 定义大消息描述、确认和一次性读取路径，控制端独立读取字节流，校验并按订阅交付原生消息。
secure-link.ts: 组合 Noise、lease 与 ready，分别核对 DSH 应用版本和 carrier 修订号，关闭同步撤销流与密钥。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
