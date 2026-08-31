/**
 * [INPUT]: 直接派生自 Beautiful UI 3ea4c18 ThemeToggle，依赖 React 状态、DOM class 与 localStorage。
 * [OUTPUT]: 提供与参考站一致的深浅主题分段切换。
 * [POS]: ui/beautiful 的主题控件，由产品壳顶部操作区消费。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from 'lucide-react';

/** Sun/moon segmented pill from the refs. */
export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    /* localStorage is the source of truth — the html class can be stale
     * for a moment around hydration (see ThemeSync). */
    try {
      setDark(localStorage.getItem("bui-theme") !== "light");
    } catch {
      setDark(document.documentElement.classList.contains("dark"));
    }
  }, []);

  function apply(next: boolean) {
    if (next === dark) return;
    setDark(next);
    /* freeze all transitions while every token flips, so the theme change
     * is one clean swap instead of hundreds of mismatched color fades */
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.classList.toggle("dark", next);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
    try {
      localStorage.setItem("bui-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <div className="relative inline-grid h-9 grid-cols-2 items-center rounded-full bg-field p-0.5">
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 w-8 rounded-full bg-surface shadow-btn
          transition-transform duration-200"
        style={{
          transform: dark ? "translateX(32px)" : "translateX(0)",
          transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
          opacity: dark === null ? 0 : 1,
        }}
      />
      <button
        aria-label="Light mode"
        onClick={() => apply(false)}
        className={`relative z-10 flex size-8 items-center justify-center rounded-full
          transition-colors duration-150 ${dark ? "text-ink-3 hover:text-ink-2" : "text-ink"}`}
      >
        <Sun size={13} strokeWidth={2.5} aria-hidden />
      </button>
      <button
        aria-label="Dark mode"
        onClick={() => apply(true)}
        className={`relative z-10 flex size-8 items-center justify-center rounded-full
          transition-colors duration-150 ${dark ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}
      >
        <Moon size={13} strokeWidth={2.5} aria-hidden />
      </button>

    </div>
  );
}
