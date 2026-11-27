/**
 * [INPUT]: 依赖 clsx 与 tailwind-merge。
 * [OUTPUT]: 对外提供 cn 类名合并工具，供所有 coss UI 组件与业务页面复用。
 * [POS]: lib/ 样式基础工具，随 coss UI 组件约定服务全局 className 合并。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
