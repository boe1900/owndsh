/**
 * [INPUT]: 依赖 React JSX 与全局页面样式类名。
 * [OUTPUT]: 提供模型根路径的空状态页面组件。
 * [POS]: routes 的可测试页面实现；文件名前缀让 TanStack 路由生成器忽略非路由源码。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export function ModelsIndexPage() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Enterprise Agent Platform</p>
        <h1>模型</h1>
      </header>
      <section className="empty-state" aria-labelledby="empty-models-title">
        <h2 id="empty-models-title">暂无模型</h2>
        <p>添加模型后会显示在这里。</p>
      </section>
    </main>
  );
}
