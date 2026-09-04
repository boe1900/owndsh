/**
 * [INPUT]: 依赖上游 Grid/Nav/ThemeToggle、META 与 Vite import.meta.glob raw 源码导入。
 * [OUTPUT]: 提供可运行、可查看源码的 Beautiful UI 组件示例页。
 * [POS]: examples 的组件参考入口，由 TanStack `/examples` 路由消费，不进入企业产品运行面。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Link } from '@tanstack/react-router';
import { Grid } from '@/components/site/Grid';
import { Nav } from '@/components/site/Nav';
import { ThemeToggle } from '@/components/site/ThemeToggle';
import { META } from '@/lib/meta';

const sourceFiles = import.meta.glob('../components/primitives/*.tsx', {
  eager: true,
  import: 'default',
  query: '?raw'
}) as Record<string, string>;

const sources = Object.fromEntries(
  META.map((entry) => [entry.id, sourceFiles[`../components/primitives/${entry.file}`] ?? ''])
);

export function ComponentExamplesPage() {
  return (
    <main className="relative mx-auto min-h-screen max-w-[960px] bg-page text-ink shadow-[0_0_0_1px_var(--line)]">
      <div className="lg:grid lg:grid-cols-[288px_minmax(0,1fr)]">
        <aside className="flex flex-col border-b border-dashed border-line px-5 pb-6 pt-12 sm:px-7 sm:pb-7 sm:pt-16 lg:sticky lg:top-0 lg:h-screen lg:overflow-hidden lg:border-b-0 lg:border-r lg:pt-[clamp(2.5rem,8vh,5rem)]">
          <div className="shrink-0">
            <div className="flex items-center justify-between">
              <img src="/beautiful-ui-logo.png" alt="Beautiful UI" className="-ml-3 size-20 shrink-0 lg:ml-0" />
              <ThemeToggle />
            </div>
            <h1 className="mt-12 text-balance text-[21px] font-semibold leading-snug text-ink lg:mt-[clamp(1.5rem,5vh,3rem)]">
              Beautiful UI components
            </h1>
            <p className="mt-2 text-[13px] text-ink-3">锁定上游源码的可执行参考</p>
          </div>

          <div className="relative mt-7 hidden min-h-0 flex-1 overflow-hidden border-t border-dashed border-line pt-6 lg:block lg:pt-0">
            <div className="component-nav-scroll h-full overflow-y-auto overscroll-contain pb-16 pt-6">
              <Nav />
            </div>
          </div>

          <div className="mt-8 flex shrink-0 flex-col gap-1 lg:mt-6">
            <Link to="/examples/harness" className="rounded-[7px] px-2 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink">
              Harness 示例
            </Link>
            <Link to="/" className="rounded-[7px] px-2 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink">
              返回产品
            </Link>
          </div>
        </aside>

        <div className="min-w-0">
          <Grid sources={sources} />
          <footer className="flex items-center justify-between gap-4 border-t border-dashed border-line px-5 py-6 sm:px-8">
            <span className="text-[12px] text-ink-3">Beautiful UI · MIT · 3ea4c181</span>
            <Link to="/examples/harness" className="text-[12px] text-ink-3 transition-colors hover:text-ink">
              Ice Cream Harness
            </Link>
          </footer>
        </div>
      </div>
    </main>
  );
}
