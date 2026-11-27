/**
 * [INPUT]: 依赖 coss UI Combobox/Field/Button 原生组件、已有分类和受控单分类值。
 * [OUTPUT]: 提供可搜索、创建、替换与清空分类的 PluginCategorySelect，约束单项 40 字符。
 * [POS]: features/plugins 的 DSH 分类输入边界；分类协议是单值，键盘导航和定位交给 coss Combobox。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { ChevronDown, Plus, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxPrimitive,
  ComboboxTrigger
} from '@/components/ui/combobox';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';

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

  return (
    <div
      className="flex flex-col items-start gap-2"
      onKeyDown={event => {
        // 选择分类的 Enter 不提交外层表单；第一次 Escape 只关闭候选列表。
        if (event.key === 'Enter' && (open || name !== '')) event.preventDefault();
        if (event.key === 'Escape' && open) event.stopPropagation();
      }}
    >
      <Label htmlFor={id}>分类</Label>
      <Combobox<string>
        autoHighlight
        items={items}
        filter={null}
        value={selected}
        disabled={disabled}
        inputValue={query}
        onInputValueChange={setQuery}
        open={open}
        onOpenChange={next => {
          setOpen(next);
          if (next && selected !== null) setQuery('');
        }}
        onValueChange={next => {
          onChange(next ?? '');
          setQuery(next ?? '');
          setOpen(false);
        }}
      >
        <InputGroup ref={anchor}>
          <ComboboxPrimitive.Input
            id={id}
            maxLength={MAX_CATEGORY_LENGTH}
            aria-describedby={`${id}-hint`}
            placeholder="选择或创建分类…"
            render={<InputGroupInput nativeInput />}
          />
          <InputGroupAddon align="inline-end" className="gap-0.5">
            {selected ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`清除分类 ${selected}`}
                disabled={disabled}
                onClick={() => { onChange(''); setQuery(''); setOpen(false); }}
              >
                <X aria-hidden />
              </Button>
            ) : null}
            <ComboboxTrigger
              aria-label="展开分类选项"
              render={<Button type="button" variant="ghost" size="icon-xs" disabled={disabled} />}
            >
              <ChevronDown aria-hidden />
            </ComboboxTrigger>
          </InputGroupAddon>
        </InputGroup>

        <ComboboxPopup anchor={anchor} sideOffset={5}>
          <ComboboxEmpty>没有匹配的分类</ComboboxEmpty>
          <ComboboxList>
            {(category: string) => (
              <ComboboxItem key={category} value={category}>
                {canCreate && category === name ? (
                  <span className="inline-flex items-center gap-2">
                    <Plus aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">创建分类「{category}」</span>
                  </span>
                ) : (
                  <span className="truncate">{category}</span>
                )}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxPopup>
      </Combobox>
      <p id={`${id}-hint`} className="m-0 text-xs text-muted-foreground">只能选择一个分类，可输入新名称后按 Enter 创建。</p>
    </div>
  );
}
