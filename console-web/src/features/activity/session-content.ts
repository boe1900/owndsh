/**
 * [INPUT]: 依赖 OpenAPI Session 正文 DTO 与浏览器 TextDecoder。
 * [OUTPUT]: 提供严格 Base64、UTF-8、JSONL 和连续序号校验后的最小 Session 事件投影。
 * [POS]: features/activity 的正文信任边界，在 React 状态前丢弃 payload/hash 传输字段。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { SessionExport } from '@/api/generated/types.gen';

export type AdminSessionEvent = {
  type: string;
  seq: number;
  time: number;
  data: unknown;
};

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeBase64(value: string) {
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

export function decodeAdminSessionEvents(content: SessionExport): readonly AdminSessionEvent[] {
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
  if (lines.some((line) => line.length === 0) || lines.length !== content.eventCount
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
    if (!isRecord(value) || typeof value.type !== 'string' || value.type.length === 0
      || !Number.isSafeInteger(value.seq) || value.seq !== expectedSeq
      || !Number.isSafeInteger(value.time) || Number(value.time) < 0
      || !Object.hasOwn(value, 'data')) {
      throw new TypeError('Session content event envelope is invalid');
    }
    return { type: value.type, seq: Number(value.seq), time: Number(value.time), data: value.data };
  });
}
