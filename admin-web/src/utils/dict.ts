/**
 * [INPUT]: 依赖系统字典数据的 label/value 只读投影
 * [OUTPUT]: 提供 Ant Design 选项形状的字典转换函数
 * [POS]: utils 的字典展示适配器，不读取或缓存字典状态
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { DictData } from '@/api/system/dict/data/types';

export function dictOptions(dicts?: Pick<DictData, 'dictLabel' | 'dictValue'>[]) {
  return (dicts || []).map(item => ({
    label: item.dictLabel,
    value: item.dictValue
  }));
}
