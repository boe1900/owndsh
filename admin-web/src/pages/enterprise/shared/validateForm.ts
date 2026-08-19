/**
 * [INPUT]: 依赖 Ant Design FormInstance 的 validateFields Promise 与可选字段范围。
 * [OUTPUT]: 提供校验成功的类型化表单值，校验拒绝时返回 undefined。
 * [POS]: enterprise 页面共享的提交边界，阻止按钮事件产生未处理 validation rejection。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import type { FormInstance } from 'antd';

export async function validatedFormValues<Values>(
  form: Pick<FormInstance<Values>, 'validateFields'>,
  fields?: Parameters<FormInstance<Values>['validateFields']>[0]
): Promise<Values | undefined> {
  try {
    return await form.validateFields(fields);
  } catch {
    return undefined;
  }
}
