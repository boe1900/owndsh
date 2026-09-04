/**
 * [INPUT]: 接收 Harness 模型容量文本或 OpenAPI 返回的正整数 Token 数。
 * [OUTPUT]: 提供十进制 K/M 单位解析与紧凑显示格式化。
 * [POS]: features/models 的表单边界适配器，只转换展示值，不改变 Server 整数契约。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const THOUSAND = 1_000;
const MILLION = 1_000_000;
const MAX_TOKENS = 2_147_483_647;
const TOKEN_CAPACITY_PATTERN = /^(\d+(?:\.\d+)?)\s*([KM])?$/i;

export const TOKEN_CAPACITY_ERROR = '请输入正整数，或使用 256K、1M 格式';

export function parseTokenCapacity(value: string | number | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const match = String(value).trim().match(TOKEN_CAPACITY_PATTERN);
  if (!match) throw new Error(TOKEN_CAPACITY_ERROR);

  const unit = match[2]?.toUpperCase();
  const multiplier = unit === 'M' ? MILLION : unit === 'K' ? THOUSAND : 1;
  const scaled = Number(match[1]) * multiplier;
  const tokens = Math.round(scaled);
  if (Math.abs(scaled - tokens) >= 1e-6 || tokens < 1 || tokens > MAX_TOKENS) {
    throw new Error(TOKEN_CAPACITY_ERROR);
  }
  return tokens;
}

export function formatTokenCapacity(value: number | undefined): string {
  if (value === undefined) return '';
  if (value % MILLION === 0) return `${value / MILLION}M`;
  if (value % THOUSAND === 0) return `${value / THOUSAND}K`;
  return String(value);
}
