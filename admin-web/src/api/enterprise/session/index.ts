/**
 * [INPUT]: 依赖 OpenAPI 生成的 Session metadata/content/delete operation 与浏览器 UTF-8 原语
 * [OUTPUT]: 提供管理 Session cursor、最小正文事件投影、严格 JSONL 解码和 tombstone 删除 API
 * [POS]: api/enterprise/session 的正文边界，在 React 状态前丢弃 payload/hash 原始传输字段
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { deleteAdminSession as generatedDeleteAdminSession } from '@/services/enterprise/deleteAdminSession';
import { listAdminSessions } from '@/services/enterprise/listAdminSessions';
import { readAdminSessionContent as generatedReadAdminSessionContent } from '@/services/enterprise/readAdminSessionContent';

export { listAdminSessions };

export type AdminSession = Awaited<ReturnType<typeof listAdminSessions>>['data']['items'][number];
type GeneratedContent = Awaited<ReturnType<typeof generatedReadAdminSessionContent>>['data'];

export interface AdminSessionEvent {
  readonly type: string;
  readonly seq: number;
  readonly time: number;
  readonly data: unknown;
}

export interface AdminSessionContentPage {
  readonly sessionId: string;
  readonly header: GeneratedContent['header'];
  readonly title: string | null;
  readonly fromSeq: number;
  readonly toSeq: number;
  readonly eventCount: number;
  readonly events: readonly AdminSessionEvent[];
  readonly hasMore: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodeBase64(value: string): Uint8Array {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const lastSymbol = value[value.length - padding - 1];
  const unusedBitMask = padding === 2 ? 0x0f : padding === 1 ? 0x03 : 0;
  if (value.length === 0 || !BASE64_PATTERN.test(value) || lastSymbol === undefined
    || (BASE64_ALPHABET.indexOf(lastSymbol) & unusedBitMask) !== 0) {
    throw new TypeError('Session content payload is not canonical Base64');
  }
  const bytes = new Uint8Array(value.length / 4 * 3 - padding);
  let output = 0;
  for (let offset = 0; offset < value.length; offset += 4) {
    const bits = BASE64_ALPHABET.indexOf(value[offset]!) << 18
      | BASE64_ALPHABET.indexOf(value[offset + 1]!) << 12
      | Math.max(0, BASE64_ALPHABET.indexOf(value[offset + 2]!)) << 6
      | Math.max(0, BASE64_ALPHABET.indexOf(value[offset + 3]!));
    if (output < bytes.length) bytes[output++] = bits >> 16;
    if (output < bytes.length) bytes[output++] = bits >> 8;
    if (output < bytes.length) bytes[output++] = bits;
  }
  return bytes;
}

/** 将一页服务端已授权正文解码为连续事件，拒绝宽松 Base64、CRLF、空行和范围漂移。 */
export function decodeAdminSessionEvents(content: GeneratedContent): readonly AdminSessionEvent[] {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64(content.payloadBase64));
  } catch (error) {
    throw new TypeError('Session content payload is not valid UTF-8', { cause: error });
  }
  if (!text.endsWith('\n') || text.includes('\r\n')) {
    throw new TypeError('Session content payload is not canonical JSONL');
  }
  const lines = text.slice(0, -1).split('\n');
  if (lines.some(line => line.length === 0) || lines.length !== content.eventCount
    || content.toSeq !== content.fromSeq + content.eventCount - 1) {
    throw new TypeError('Session content range does not match its payload');
  }
  return lines.map((line, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new TypeError('Session content line is not valid JSON', { cause: error });
    }
    const expectedSeq = content.fromSeq + index;
    if (!isRecord(value) || typeof value['type'] !== 'string' || value['type'].length === 0
      || !Number.isSafeInteger(value['seq']) || value['seq'] !== expectedSeq
      || !Number.isSafeInteger(value['time']) || Number(value['time']) < 0
      || !Object.hasOwn(value, 'data')) {
      throw new TypeError('Session content event envelope is invalid');
    }
    return {
      type: value['type'],
      seq: Number(value['seq']),
      time: Number(value['time']),
      data: value['data'],
    };
  });
}

/** 读取一页正文并在 API 边界删除 Base64/hash，只把页面所需事件事实交给 React。 */
export async function readAdminSessionContent(replicaId: string, fromSeq = 0, limit = 50): Promise<AdminSessionContentPage> {
  const response = await generatedReadAdminSessionContent({ replicaId, fromSeq, limit });
  const content = response.data;
  return {
    sessionId: content.sessionId,
    header: content.header,
    title: content.title,
    fromSeq: content.fromSeq,
    toSeq: content.toSeq,
    eventCount: content.eventCount,
    events: decodeAdminSessionEvents(content),
    hasMore: content.hasMore,
  };
}

export function deleteAdminSession(replicaId: string) {
  return generatedDeleteAdminSession({ replicaId });
}
