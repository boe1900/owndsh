/**
 * [INPUT]: 依赖 React、Beautiful UI foundation 以及文件内声明的基础能力。
 * [OUTPUT]: 对外提供 Chip 原子组件及其公开类型。
 * [POS]: components/atoms 的上游基础控件，由 primitives 与 examples 复用；源自 Beautiful UI 3ea4c181。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

/** Monospace token chip — for code values like `updated_at`. */
export function Chip({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "orange";
  className?: string;
}) {
  const tones = {
    neutral: "bg-inset text-ink-2",
    accent: "bg-accent-tint text-accent-ink",
    orange: "bg-orange-tint text-orange",
  };
  return (
    <code
      className={`inline rounded-md px-1.5 py-0.5 font-mono text-[12px]
        leading-none align-[-1px] ${tones[tone]} ${className}`}
    >
      {children}
    </code>
  );
}
