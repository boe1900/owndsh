/**
 * [INPUT]: 封装 JCA 初始化、加密、认证失败等底层异常。
 * [OUTPUT]: 对外提供不携带秘密内容的稳定 crypto 运行时异常。
 * [POS]: crypto 模块的错误边界，避免把明文、key 或 JCA 细节拼进日志消息。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
package com.owndsh.enterprise.crypto;

/**
 * 秘密加解密失败。
 */
public final class SecretCipherException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    SecretCipherException(Throwable cause) {
        super("秘密加解密失败", cause);
    }
}
