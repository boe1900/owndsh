/**
 * [INPUT]: 直接派生自 Beautiful UI 3ea4c18 ThemeSync，依赖浏览器 localStorage 与根元素 class。
 * [OUTPUT]: 在 React 启动后恢复 Beautiful UI 深浅主题真值。
 * [POS]: ui/beautiful 的主题同步器，由浏览器装配入口消费。
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
