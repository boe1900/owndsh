/**
 * [INPUT]: 依赖公开环境中的 RSA key 与 jsencrypt 浏览器实现
 * [OUTPUT]: 提供上游 RuoYi 请求字段的 RSA 加密/解密兼容函数
 * [POS]: utils 的 RSA 兼容边界，不管理 enterprise-admin Token 或中心密钥
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { JSEncrypt } from 'jsencrypt';
import { appEnv } from '@/utils/env';

export function encrypt(txt: string) {
  const encryptor = new JSEncrypt();
  encryptor.setPublicKey(appEnv.rsaPublicKey);
  return encryptor.encrypt(txt);
}

export function decrypt(txt: string) {
  const encryptor = new JSEncrypt();
  encryptor.setPrivateKey(appEnv.rsaPrivateKey);
  return encryptor.decrypt(txt);
}
