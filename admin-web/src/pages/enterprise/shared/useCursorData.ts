/**
 * [INPUT]: 依赖 React 状态与返回 items/page 的服务端 cursor loader
 * [OUTPUT]: 提供 cursor 列表数据、刷新和追加下一页动作
 * [POS]: pages/enterprise 的分页状态机，cursor 始终作为不透明字符串回传服务端
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface CursorPage<T> {
  items: T[];
  page: { hasMore: boolean; nextCursor: string | null };
}

export function useCursorData<T>(loader: (cursor?: string) => Promise<CursorPage<T>>) {
  const loaderRef = useRef(loader);
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const fetchPage = useCallback(async (cursor?: string, append = false) => {
    setLoading(true);
    try {
      const data = await loaderRef.current(cursor);
      setItems(current => (append ? [...current, ...data.items] : data.items));
      setNextCursor(data.page.hasMore ? data.page.nextCursor : null);
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(() => fetchPage(), [fetchPage]);
  const loadMore = useCallback(
    () => (nextCursor ? fetchPage(nextCursor, true) : Promise.resolve()),
    [fetchPage, nextCursor]
  );

  useEffect(() => {
    void reload();
  }, [loader, reload]);

  return { items, loading, hasMore: Boolean(nextCursor), reload, loadMore };
}
