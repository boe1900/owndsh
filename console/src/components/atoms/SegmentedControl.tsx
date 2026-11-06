/**
 * [INPUT]: 依赖 React、Beautiful UI foundation 以及文件内声明的基础能力。
 * [OUTPUT]: 对外提供 SegmentedControl 原子组件及其公开类型；可选 counts 属性为分段渲染 aria-hidden 计数徽章（不污染 accessible name）。
 * [POS]: components/atoms 的上游基础控件，由 primitives、examples 与产品分区切换复用；源自 Beautiful UI 3ea4c181，counts 徽章为本项目扩展。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

"use client";

/** Segmented control — equal-width segments, sliding thumb. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
  counts
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  counts?: Partial<Record<T, number>>;
}) {
  const index = options.indexOf(value);
  return (
    <div
      className={`relative inline-grid h-8 select-none rounded-full bg-line/60 p-0.5 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
      role="tablist"
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 rounded-full bg-surface shadow-hairline
          transition-transform duration-200"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          left: 2,
          transform: `translateX(${index * 100}%)`,
          transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
        }}
      />
      {options.map((opt) => {
        const count = counts?.[opt];
        return (
          <button
            key={opt}
            role="tab"
            aria-selected={opt === value}
            onClick={() => onChange(opt)}
            className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-medium
              transition-colors duration-150
              ${opt === value ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}
          >
            {opt}
            {count !== undefined ? (
              <span
                aria-hidden
                className={`inline-flex min-w-4 items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-semibold leading-none tabular-nums
                  ${opt === value ? "bg-ink text-canvas" : "bg-line text-ink-2"}`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
