/**
 * [INPUT]: 依赖从 Beautiful UI 3ea4c181 直接迁移的 IceCreamHarness 与开发态 DialKit 调参面板。
 * [OUTPUT]: 提供原始 `/harness` 完整可交互示例页，开发环境保留上游调参能力。
 * [POS]: examples 的壳行为基线，隔离仅供参考的运行时，避免调参工具进入企业产品页面。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { DialRoot } from 'dialkit';
import 'dialkit/styles.css';
import IceCreamHarness from '@/components/site/IceCreamHarness';

export function HarnessExamplePage() {
  return (
    <>
      <IceCreamHarness />
      {import.meta.env.DEV && <DialRoot position="top-right" />}
    </>
  );
}
