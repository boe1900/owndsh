/**
 * [INPUT]: 依赖 shadcn Combobox 同源 Base UI 原语、已有分类和受控单分类值。
 * [OUTPUT]: 提供可搜索、创建、替换与清空分类的 PluginCategorySelect，约束单项 40 字符。
 * [POS]: features/plugins 的 DSH 分类输入边界；分类协议是单值，键盘导航和定位交给 Base UI。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Combobox } from '@base-ui/react/combobox';
import { ChevronDown, Plus, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';

// ---------- 与服务端 PluginInstallation.category 的 40 字符边界保持一致 ----------
const MAX_CATEGORY_LENGTH = 40;
const SUGGESTED_CATEGORIES = ['开发工具', '效率工具', '知识管理', '数据分析', '内容创作', '工作流'];

export function PluginCategorySelect({ options, value, onChange, disabled = false }: {
  options: ReadonlyArray<string>;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = value || null;
  const categories = [...new Set([...options, ...SUGGESTED_CATEGORIES, ...(selected ? [selected] : [])])];
  const name = query.trim();
  const normalized = name.toLocaleLowerCase();
  const canCreate = name !== '' && name.length <= MAX_CATEGORY_LENGTH
    && !/[\x00-\x1f\x7f-\x9f]/.test(name)
    && !categories.some(category => category.toLocaleLowerCase() === normalized);
  const items = categories.filter(category => category.toLocaleLowerCase().includes(normalized));
  if (canCreate) items.push(name);

  return <div className="grid gap-1.5" onKeyDown={event => {
    // 选择分类的 Enter 不提交外层表单；第一次 Escape 只关闭候选列表。
    if (event.key === 'Enter' && (open || name !== '')) event.preventDefault();
    if (event.key === 'Escape' && open) event.stopPropagation();
  }}>
    <label htmlFor={id} className="text-[12.5px] font-medium text-ink-2">分类</label>
    <Combobox.Root<string> autoHighlight items={items} filter={null} value={selected} disabled={disabled}
      inputValue={query} onInputValueChange={setQuery} open={open} onOpenChange={next => {
        setOpen(next);
        if (next && selected !== null) setQuery('');
      }}
      onValueChange={next => {
        onChange(next ?? '');
        setQuery(next ?? '');
        setOpen(false);
      }}
    >
      <div ref={anchor} className="flex min-h-9 items-center rounded-lg border border-line bg-canvas px-2 text-[13px] text-ink focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-tint data-disabled:opacity-60">
        <Combobox.Input id={id} maxLength={MAX_CATEGORY_LENGTH} aria-describedby={`${id}-hint`}
          placeholder="选择或创建分类…"
          className="min-w-0 flex-1 bg-transparent px-1 py-1.5 outline-none placeholder:text-ink-3" />
        {selected ? <button type="button" aria-label={`清除分类 ${selected}`} disabled={disabled}
          className="flex size-6 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          onClick={() => { onChange(''); setQuery(''); setOpen(false); }}><X aria-hidden className="size-3.5" /></button> : null}
        <Combobox.Trigger aria-label="展开分类选项" className="flex size-6 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent">
          <ChevronDown aria-hidden className="size-3.5" />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner anchor={anchor} sideOffset={5} className="z-[60] outline-none">
          <Combobox.Popup className="w-[var(--anchor-width)] max-w-[var(--available-width)] overflow-hidden rounded-lg border border-line-strong bg-surface text-[13px] text-ink shadow-overlay">
            <Combobox.Empty><div className="px-3 py-4 text-center text-[12px] text-ink-3">没有匹配的分类</div></Combobox.Empty>
            <Combobox.List className="max-h-[min(240px,var(--available-height))] scroll-py-1 overflow-y-auto overscroll-contain p-1">
              {(category: string) => <Combobox.Item key={category} value={category}
                className="relative flex cursor-default items-center gap-2 rounded-md py-2 pl-2 pr-8 outline-none select-none data-highlighted:bg-hover">
                {canCreate && category === name
                  ? <><Plus aria-hidden className="size-3.5 shrink-0 text-ink-3" /><span className="truncate">创建分类「{category}」</span></>
                  : <span className="truncate">{category}</span>}
              </Combobox.Item>}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
    <p id={`${id}-hint`} className="m-0 text-[11.5px] text-ink-3">只能选择一个分类，可输入新名称后按 Enter 创建。</p>
  </div>;
}
