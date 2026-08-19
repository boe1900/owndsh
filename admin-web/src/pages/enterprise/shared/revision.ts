/**
 * [INPUT]: 依赖统一 EnterpriseRequestError 和 Ant Design 消息反馈
 * [OUTPUT]: 提供 revision 冲突识别与服务端事实恢复编排
 * [POS]: pages/enterprise 的 CAS 冲突公共策略，只重读不自动覆盖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { message } from 'antd';
import { isEnterpriseRequestError } from '@/api/request';

export async function recoverRevisionConflict(error: unknown, reload: () => Promise<void>): Promise<boolean> {
  if (!isEnterpriseRequestError(error) || error.code !== 'ENT_REVISION_CONFLICT') return false;
  await reload();
  message.info('配置已被其他管理员更新，已重新加载服务端最新内容');
  return true;
}
