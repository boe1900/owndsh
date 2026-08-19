/**
 * [INPUT]: 依赖系统 OSS 批量查询 API 与正文中的 oss:// 标记
 * [OUTPUT]: 提供去重解析 OSS 标记为授权 URL 的容错转换
 * [POS]: utils 的富文本 OSS 引用解析边界，查询失败保持原正文
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { listByIds } from '@/api/system/oss';

const OSS_MARKER_RE = /oss:\/\/([\w-]+)/g;

export async function resolveOssContent(html: string): Promise<string> {
  if (!html) return html;

  const matches = [...html.matchAll(OSS_MARKER_RE)];
  if (!matches.length) return html;

  const ossIds = [...new Set(matches.map(match => match[1]))];

  try {
    const res = await listByIds(ossIds.join(','));
    let result = html;
    for (const oss of res.data || []) {
      result = result.replaceAll(`oss://${oss.ossId}`, oss.url);
    }
    return result;
  } catch {
    return html;
  }
}
