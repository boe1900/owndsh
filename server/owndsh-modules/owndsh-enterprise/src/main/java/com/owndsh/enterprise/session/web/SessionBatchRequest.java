/**
 * [INPUT]: 绑定 runtime batch JSON 的范围、Base64、hash、官方完整 SessionHeader 与 title。
 * [OUTPUT]: 对外提供不含 actor/device 的 SessionBatchUpload 转换。
 * [POS]: session/web 的上传 DTO；精确字节、header 和 envelope 语义由 application parser 统一校验。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.session.web;

import com.owndsh.enterprise.session.application.SessionBatchUpload;
import tools.jackson.databind.JsonNode;

public record SessionBatchRequest(
    String idempotencyKey,
    long fromSeq,
    long toSeq,
    String previousRollingHash,
    String payloadSha256,
    String payloadBase64,
    JsonNode header,
    String title
) {
    public SessionBatchUpload command() {
        return new SessionBatchUpload(
            idempotencyKey,fromSeq,toSeq,previousRollingHash,payloadSha256,payloadBase64,header,title
        );
    }
}
