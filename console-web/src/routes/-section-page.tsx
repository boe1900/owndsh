/**
 * [INPUT]: 依赖 Beautiful UI foundation 的 Tailwind token 与页面标题/空状态文案。
 * [OUTPUT]: 提供第二阶段业务路由共享的平面内容区与空状态。
 * [POS]: routes 的临时业务内容骨架；外壳已真实可用，各纵向任务再替换对应空状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function SectionPage({ emptyText, title }: { emptyText: string; title: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-[960px] flex-col px-5 py-7 sm:px-8 sm:py-9">
        <header className="border-b border-line pb-5">
          <h1 className="m-0 text-[22px] font-semibold leading-tight text-ink">{title}</h1>
        </header>
        <section className="flex min-h-[320px] flex-1 items-center justify-center" aria-label={emptyText}>
          <p className="m-0 text-[13.5px] text-ink-3">{emptyText}</p>
        </section>
      </div>
    </div>
  );
}
