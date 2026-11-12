/**
 * [INPUT]: 依赖认证 Server 绑定的双端静态公钥、标准 Noise 会话、租约 ack 与原生 carrier 工厂。
 * [OUTPUT]: 提供有截止时间的远端 DSH link；失联/撤权同步关闭准入、流和密钥所有者。
 * [POS]: remote-core 安全 link 的兼容导出，Host 和 Console 共用同一实现。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export { SecureDshLink, remoteFrameId, type RemoteDshLink, type SecureLinkOptions } from '@owndsh/remote-core'
