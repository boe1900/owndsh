/**
 * [INPUT]: 依赖已经完成 Noise/lease 的密文发送边界、字节信用流和 Host 原生 carrier。
 * [OUTPUT]: 提供 HTTP 请求/响应流与原生 WS 文本 mux 的双端隧道，取消后丢弃在途尾帧。
 * [POS]: remote-core carrier tunnel 的兼容导出，不在 bundle 保存第二份协议。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export { CarrierTunnel } from '@owndsh/remote-core'
