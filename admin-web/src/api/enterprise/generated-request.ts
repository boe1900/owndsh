/**
 * [INPUT]: 依赖管理端统一 Axios request 与 Umi OpenAPI 生成函数的 url/options/multipart 元数据调用形状
 * [OUTPUT]: 为生成代码提供保持认证、错误和加密策略一致且剥离生成器元数据的 request 适配器
 * [POS]: api/enterprise 的生成边界，禁止生成代码绕开全局管理会话处理
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import request, { type RequestConfig } from '@/api/request';

interface GeneratedRequestOptions extends RequestConfig {
  requestType?: 'form';
}

export default function generatedRequest<T>(url: string, options: GeneratedRequestOptions = {}): Promise<T> {
  const { requestType: _requestType, ...requestOptions } = options;
  return request<T>({ ...requestOptions, url });
}
