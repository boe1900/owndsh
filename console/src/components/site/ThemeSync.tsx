/**
 * [INPUT]: 依赖 React、Beautiful UI foundation 以及文件内声明的组件和浏览器能力。
 * [OUTPUT]: 对外提供 ThemeSync 站点级装配组件及其公开类型。
 * [POS]: components/site 的上游 Harness/画廊运行面，由 TanStack examples 路由消费；源自 Beautiful UI 3ea4c181。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

"use client";

import { useEffect } from "react";

/* React 19 reconciles <html>'s className during hydration, wiping the class
 * the pre-paint head script set. This re-applies the stored theme the moment
 * hydration finishes, on every page. */
export function ThemeSync() {
  useEffect(() => {
    try {
      const theme = localStorage.getItem("bui-theme");
      document.documentElement.classList.toggle("dark", theme !== "light");
    } catch {
      document.documentElement.classList.add("dark");
    }
  }, []);

  return null;
}
