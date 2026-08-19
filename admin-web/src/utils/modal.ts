/**
 * [INPUT]: 依赖 Ant Design 命令式 Modal 与 ReactNode 内容
 * [OUTPUT]: 提供 Promise 化确认框及取消转 boolean 的安全动作包装
 * [POS]: utils 的破坏性操作确认边界，由业务页面决定具体命令
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Modal, type ModalFuncProps } from 'antd';
import type { ReactNode } from 'react';

const CANCELLED = new Error('cancelled');

export function confirmModal(options: ModalFuncProps) {
  return new Promise<void>((resolve, reject) => {
    Modal.confirm({
      title: '系统提示',
      ...options,
      onOk: () => resolve(),
      onCancel: () => reject(CANCELLED)
    });
  });
}

export function confirmAction(content: ReactNode, options?: Omit<ModalFuncProps, 'content' | 'onOk' | 'onCancel'>) {
  return confirmModal({ content, ...options });
}

export function confirmTitle(title: ReactNode, options?: Omit<ModalFuncProps, 'title' | 'onOk' | 'onCancel'>) {
  return confirmModal({ title, ...options });
}

export async function confirmTitleSafe(
  title: ReactNode,
  options?: Omit<ModalFuncProps, 'title' | 'onOk' | 'onCancel'>
) {
  try {
    await confirmTitle(title, options);
    return true;
  } catch {
    return false;
  }
}
