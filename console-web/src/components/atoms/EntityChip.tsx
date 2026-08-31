/**
 * [INPUT]: 依赖 React、Beautiful UI foundation 以及文件内声明的基础能力。
 * [OUTPUT]: 对外提供 EntityChip 原子组件及其公开类型。
 * [POS]: components/atoms 的上游基础控件，由 primitives 与 examples 复用；源自 Beautiful UI 3ea4c181。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

/** Monogram mark — a colored disc with an initial or short glyph.
 *  The shared building block for entity chips and monogram headings. */
export function Monogram({
  children,
  color = "#e08a3c",
  className = "",
}: {
  children: React.ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={`flex size-4 shrink-0 items-center justify-center rounded-full
        text-[9px] font-semibold leading-none text-white ${className}`}
      style={{ background: color }}
    >
      {children}
    </span>
  );
}

/** Inline entity reference — a monogram + name in a soft field pill.
 *  Names a supplier, person, or record inside running text. Softer than a
 *  StatusPill (no dot, no state) and not a mono token (see Chip). */
export function EntityChip({
  name,
  color,
  monogram,
  className = "",
}: {
  name: string;
  color?: string;
  monogram?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`mx-0.5 inline-flex items-center gap-1 rounded-full bg-field
        py-px pl-[3px] pr-1.5 align-middle shadow-hairline ${className}`}
    >
      <Monogram color={color}>{monogram ?? name.charAt(0)}</Monogram>
      <span className="text-[12px] font-medium text-ink">{name}</span>
    </span>
  );
}
