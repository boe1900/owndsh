/**
 * [INPUT]: 依赖文件内声明的 Beautiful UI 组件元数据或 class 合并能力。
 * [OUTPUT]: 对外提供 utils 模块的注册表、元数据或工具导出。
 * [POS]: lib 的上游组件目录支撑层，仅服务 components 与 examples；源自 Beautiful UI 3ea4c181。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names, letting later Tailwind classes win over conflicting earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
