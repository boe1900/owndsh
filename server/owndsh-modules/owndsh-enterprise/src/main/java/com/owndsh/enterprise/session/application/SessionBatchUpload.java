/**
 * [INPUT]: 接收 Controller 已绑定但尚未信任的批次范围、Base64 字节、hash、header 与 title。
 * [OUTPUT]: 对外提供 application parser 的不可变原始上传命令。
 * [POS]: session/web 到 application 的传输边界，不携带 actor、device 或服务端租户事实。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.session.application;

import tools.jackson.databind.JsonNode;

public record SessionBatchUpload(
    String idempotencyKey,
    long fromSeq,
    long toSeq,
    String previousRollingHash,
    String payloadSha256,
    String payloadBase64,
    JsonNode header,
    String title
) {
}
