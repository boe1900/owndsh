/**
 * [INPUT]: 依赖 React、Beautiful UI foundation 以及文件内声明的基础能力。
 * [OUTPUT]: 对外提供 StatusPill 原子组件及其公开类型。
 * [POS]: components/atoms 的上游基础控件，由 primitives 与 examples 复用；源自 Beautiful UI 3ea4c181。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusPillVariants = cva(
  "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-medium leading-none",
  {
    variants: {
      tone: {
        green: "bg-green-tint text-green",
        orange: "bg-orange-tint text-orange",
        red: "bg-red-tint text-red",
        accent: "bg-accent-tint text-accent-ink",
        neutral: "bg-inset text-ink-2",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

type Tone = NonNullable<VariantProps<typeof statusPillVariants>["tone"]>;

/* the leading dot lives on a separate element, so its color stays a small lookup */
const dotColor: Record<Tone, string> = {
  green: "bg-green",
  orange: "bg-orange",
  red: "bg-red",
  accent: "bg-accent",
  neutral: "bg-ink-3",
};

export function StatusPill({
  tone = "neutral",
  children,
  dot = true,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={cn(statusPillVariants({ tone }), className)}>
      {dot && <span className={cn("size-1.5 rounded-full", dotColor[tone])} />}
      {children}
    </span>
  );
}
