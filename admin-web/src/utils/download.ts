/**
 * [INPUT]: 依赖统一 request、RuoYi blob 错误协议和浏览器 Object URL
 * [OUTPUT]: 提供表单下载、响应校验与本地文件保存函数
 * [POS]: utils 的下载副作用边界，统一释放临时 URL 并展示服务端错误
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { message } from 'antd';
import request from '@/api/request';
import { blobValidate, parseBlobErrorMessage, tansParams } from '@/utils/ruoyi';

export async function download(url: string, params: Record<string, unknown>, fileName: string) {
  const hide = message.loading('正在下载数据，请稍候', 0);
  try {
    const blob = await request<Blob>({
      url,
      method: 'post',
      data: params,
      transformRequest: [
        data => {
          return tansParams(data);
        }
      ],
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      responseType: 'blob'
    });
    if (await blobValidate(blob)) {
      saveBlob(blob, fileName);
      return;
    }
    message.error(await parseBlobErrorMessage(blob));
  } finally {
    hide();
  }
}

export function saveBlob(blob: Blob, fileName: string) {
  const objectUrl = window.URL.createObjectURL(new Blob([blob]));
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
}

export async function saveValidatedBlob(blob: Blob, fileName: string) {
  if (await blobValidate(blob)) {
    saveBlob(blob, fileName);
    return;
  }
  message.error(await parseBlobErrorMessage(blob));
}
