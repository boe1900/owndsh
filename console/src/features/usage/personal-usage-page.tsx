/**
 * [INPUT]: 依赖 coss UI Card/Tabs/Popover/Field/Input/Button/Badge/Separator、共享 ProductDataTable（TableStackCell / TableStatusBadge）与生成的本人用量接口。
 * [OUTPUT]: 提供面向全部已登录成员的用量页 `PersonalUsagePage`，支持近 7 天/近 30 天/本月/自定义日期区间切换，展示个人用量 KPI、模型用量分布条、消耗趋势与统一 ProductDataTable 近期调用明细。
 * [POS]: features/usage 的个人用量工作台，作为全角色共用的「个人 -> 用量」入口与普通员工默认首页。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Activity, CalendarRange, Cpu, Layers, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getPersonalUsage } from '@/api/generated/sdk.gen';
import type { GetPersonalUsageResponse } from '@/api/generated/types.gen';
import {
  ProductDataTable,
  TableStackCell,
  TableStatusBadge,
  type ProductTableColumn
} from '@/components/product/DataTable';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle
} from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type PresetRangeKey = '7d' | '30d' | 'month';
type UsageRangeKey = PresetRangeKey | 'custom';
type CustomDateRange = { start: string; end: string };

type UsageData = GetPersonalUsageResponse['data'];
type RecentCallItem = UsageData['items'][number] & { time: string };

const RANGE_LABELS = { '7d': '近 7 天', '30d': '近 30 天', month: '本月' };
const MODEL_COLORS = ['bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500'];

function formatTokens(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function formatCompactTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function sharePercent(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

const MAX_CUSTOM_DAYS = 90;

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const utc = Date.UTC(year, month - 1, day);
  return Number.isNaN(utc) ? null : utc;
}

function diffDaysInclusive(start: string, end: string) {
  const startMs = parseDateInput(start);
  const endMs = parseDateInput(end);
  if (startMs === null || endMs === null) return 0;
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

function shiftDateInput(base: string, offsetDays: number) {
  const baseMs = parseDateInput(base);
  if (baseMs === null) return base;
  const date = new Date(baseMs + offsetDays * 86_400_000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShortDate(value: string) {
  const [, month, day] = value.split('-');
  return month && day ? `${month}-${day}` : value;
}

function previousMonthRange(today: Date): CustomDateRange {
  const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  return {
    start: toDateInputValue(firstDayLastMonth),
    end: toDateInputValue(lastDayLastMonth)
  };
}

const recentCallColumns: ReadonlyArray<ProductTableColumn<RecentCallItem>> = [
  {
    accessorKey: 'time',
    header: '时间',
    cell: ({ getValue }) => (
      <span className="block truncate text-xs text-muted-foreground">{String(getValue())}</span>
    ),
    meta: { label: '时间', className: 'w-[140px]', cellClassName: 'w-[140px]' }
  },
  {
    id: 'model',
    accessorFn: (row) => `${row.modelName} ${row.modelAlias}`,
    header: '模型',
    cell: ({ row }) => <TableStackCell primary={row.original.modelName} secondary={row.original.modelAlias} />,
    meta: { label: '模型', className: 'w-[240px]', cellClassName: 'w-[240px]' }
  },
  {
    accessorKey: 'inputTokens',
    header: '输入',
    cell: ({ getValue, row }) => (
      <span className="block truncate font-mono text-xs tabular-nums">{row.original.result === 'SETTLED' ? formatTokens(Number(getValue())) : '—'}</span>
    ),
    meta: { label: '输入', className: 'w-[110px]', cellClassName: 'w-[110px]' }
  },
  {
    accessorKey: 'outputTokens',
    header: '输出',
    cell: ({ getValue, row }) => (
      <span className="block truncate font-mono text-xs tabular-nums">{row.original.result === 'SETTLED' ? formatTokens(Number(getValue())) : '—'}</span>
    ),
    meta: { label: '输出', className: 'w-[110px]', cellClassName: 'w-[110px]' }
  },
  {
    id: 'totalTokens',
    accessorKey: 'totalTokens',
    header: '总计',
    cell: ({ getValue, row }) => (
      <span className="block truncate font-mono text-xs font-medium tabular-nums">
        {row.original.result === 'SETTLED' ? formatTokens(Number(getValue())) : '—'}
      </span>
    ),
    meta: { label: '总计', className: 'w-[120px]', cellClassName: 'w-[120px]' }
  },
  {
    id: 'status',
    accessorFn: (row) => row.result,
    header: '状态',
    filterFn: 'equalsString',
    cell: ({ row }) => <TableStatusBadge
      label={row.original.result === 'SETTLED' ? '已计量' : '用量未知'}
      tone={row.original.result === 'SETTLED' ? 'success' : 'warning'}
    />,
    meta: { label: '状态', className: 'w-[110px]', cellClassName: 'w-[110px]' }
  }
];

export function PersonalUsagePage({ memberId }: { memberId: string }) {
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toDateInputValue(today), [today]);
  const defaultCustomRange = useMemo<CustomDateRange>(
    () => ({ start: shiftDateInput(todayStr, -13), end: todayStr }),
    [todayStr]
  );

  const [range, setRange] = useState<UsageRangeKey>('7d');
  const [customRange, setCustomRange] = useState<CustomDateRange>(defaultCustomRange);
  const [customOpen, setCustomOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(defaultCustomRange.start);
  const [draftEnd, setDraftEnd] = useState(defaultCustomRange.end);
  const [customError, setCustomError] = useState<string>();

  const filters = range === 'custom'
    ? { range, start: customRange.start, end: customRange.end }
    : { range };
  const usage = useInfiniteQuery({
    queryKey: ['personal-usage', memberId, filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const result = await getPersonalUsage({ query: { ...filters, cursor: pageParam }, signal });
      if (!result.data) throw new Error(result.error?.error?.message ?? '个人用量读取失败');
      return result.data.data;
    },
    getNextPageParam: (lastPage) => lastPage.page.nextCursor ?? undefined
  });
  const snapshot = usage.data?.pages[0];
  const recentCalls = useMemo(() => {
    if (!usage.data) return [];
    const dates = new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'short', timeStyle: 'short', timeZone: usage.data.pages[0]?.timeZone
    });
    return usage.data.pages.flatMap((page) => page.items.map((item) => ({
      ...item, time: dates.format(new Date(item.createdAt))
    })));
  }, [usage.data]);

  const handleCustomOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftStart(customRange.start);
      setDraftEnd(customRange.end);
      setCustomError(undefined);
    }
    setCustomOpen(nextOpen);
  };

  const applyCustomRange = () => {
    if (!draftStart || !draftEnd) {
      setCustomError('请选择完整的起止日期');
      return;
    }
    if (draftStart > draftEnd) {
      setCustomError('开始日期不能晚于结束日期');
      return;
    }
    const latestDate = snapshot
      ? new Intl.DateTimeFormat('sv-SE', { timeZone: snapshot.timeZone }).format(today)
      : todayStr;
    if (draftEnd > latestDate) {
      setCustomError('结束日期不能超过今天');
      return;
    }
    if (diffDaysInclusive(draftStart, draftEnd) > MAX_CUSTOM_DAYS) {
      setCustomError(`自定义时间跨度最长支持 ${MAX_CUSTOM_DAYS} 天`);
      return;
    }
    setCustomRange({ start: draftStart, end: draftEnd });
    setRange('custom');
    setCustomError(undefined);
    setCustomOpen(false);
  };

  const customLabel = range === 'custom'
    ? `${formatShortDate(customRange.start)} ~ ${formatShortDate(customRange.end)}`
    : '自定义';

  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-stable">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="m-0 text-[22px] font-semibold tracking-tight leading-tight text-foreground">
                个人用量
              </h1>
            </div>
            <p className="m-0 text-sm text-muted-foreground">
              查看当前账号在不同模型上的 Token 消耗分布与日常调用趋势。
            </p>
          </div>

          <Tabs
            value={range}
            onValueChange={(nextValue) => {
              if (nextValue === '7d' || nextValue === '30d' || nextValue === 'month') {
                setRange(nextValue);
                setCustomOpen(false);
              }
            }}
          >
            <TabsList>
              <TabsTab value="7d">近 7 天</TabsTab>
              <TabsTab value="30d">近 30 天</TabsTab>
              <TabsTab value="month">本月</TabsTab>
              <Popover open={customOpen} onOpenChange={handleCustomOpenChange}>
                <PopoverTrigger
                  render={
                    <TabsTab value="custom" className="gap-1.5 tabular-nums">
                      <CalendarRange aria-hidden className="size-3.5" />
                      <span>{customLabel}</span>
                    </TabsTab>
                  }
                />
                <PopoverPopup
                  align="end"
                  sideOffset={8}
                  className="w-80 [&_[data-slot=popover-viewport]]:p-4"
                >
                  <form
                    className="grid gap-3.5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      applyCustomRange();
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">自定义时间范围</span>
                      <span className="text-[11px] text-muted-foreground">最长 {MAX_CUSTOM_DAYS} 天</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          setDraftStart(shiftDateInput(todayStr, -13));
                          setDraftEnd(todayStr);
                          setCustomError(undefined);
                        }}
                      >
                        近 14 天
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          setDraftStart(shiftDateInput(todayStr, -44));
                          setDraftEnd(todayStr);
                          setCustomError(undefined);
                        }}
                      >
                        近 45 天
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          const prev = previousMonthRange(today);
                          setDraftStart(prev.start);
                          setDraftEnd(prev.end);
                          setCustomError(undefined);
                        }}
                      >
                        上月
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <Field>
                        <FieldLabel>开始日期</FieldLabel>
                        <Input
                          type="date"
                          size="sm"
                          max={todayStr}
                          value={draftStart}
                          onChange={(event) => {
                            setDraftStart(event.target.value);
                            setCustomError(undefined);
                          }}
                        />
                      </Field>
                      <Field>
                        <FieldLabel>结束日期</FieldLabel>
                        <Input
                          type="date"
                          size="sm"
                          max={todayStr}
                          value={draftEnd}
                          onChange={(event) => {
                            setDraftEnd(event.target.value);
                            setCustomError(undefined);
                          }}
                        />
                      </Field>
                    </div>

                    {customError ? (
                      <Alert variant="error" className="px-2.5 py-2 text-xs">
                        <AlertDescription>{customError}</AlertDescription>
                      </Alert>
                    ) : null}

                    <div className="flex items-center justify-end gap-2 border-t pt-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setCustomOpen(false)}
                      >
                        取消
                      </Button>
                      <Button type="submit" size="xs">
                        应用范围
                      </Button>
                    </div>
                  </form>
                </PopoverPopup>
              </Popover>
            </TabsList>
          </Tabs>
        </header>

        {usage.isPending ? <p role="status" className="text-sm text-muted-foreground">正在加载个人用量…</p> : null}
        {usage.isError && !snapshot ? (
          <Alert variant="error">
            <AlertDescription>{usage.error.message}</AlertDescription>
            <Button size="sm" variant="outline" onClick={() => void usage.refetch()}>重试</Button>
          </Alert>
        ) : null}
        {snapshot ? (
          <UsageResults
            snapshot={snapshot}
            label={range === 'custom' ? customLabel : RANGE_LABELS[range]}
            recentCalls={recentCalls}
            hasMore={usage.hasNextPage}
            isLoadingMore={usage.isFetchingNextPage}
            error={usage.error}
            onLoadMore={() => void usage.fetchNextPage()}
            onRetry={() => void (usage.isFetchNextPageError ? usage.fetchNextPage() : usage.refetch())}
          />
        ) : null}
      </div>
    </div>
  );
}

function UsageResults({
  snapshot, label, recentCalls, hasMore, isLoadingMore, error, onLoadMore, onRetry
}: {
  snapshot: UsageData;
  label: string;
  recentCalls: RecentCallItem[];
  hasMore: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  const topModel = snapshot.models.find((model) => model.totalTokens > 0);
  const topModelTotal = topModel?.totalTokens ?? 0;
  const maxDailyTokens = Math.max(0, ...snapshot.dailyTrend.map((item) => item.tokens));
  const dailyAverageTokens = Math.round(snapshot.summary.totalTokens / Math.max(1, snapshot.dailyTrend.length));
  const { successful, finished } = snapshot.outcomes;
  const successRate = finished ? `${sharePercent(successful, finished)}%` : '—';
  const labelStep = Math.max(1, Math.ceil(snapshot.dailyTrend.length / 7));

  return (
    <>
      <section aria-label="关键用量指标" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <UsageMetricCard
          icon={<Layers aria-hidden className="size-4 text-muted-foreground" />}
          label={`${label}总消耗`}
          value={formatCompactTokens(snapshot.summary.totalTokens)}
          hint={`输入 ${formatCompactTokens(snapshot.summary.inputTokens)} · 输出 ${formatCompactTokens(snapshot.summary.outputTokens)} · 缓存 ${formatCompactTokens(snapshot.summary.cacheTokens)}`}
        />
        <UsageMetricCard
          icon={<Activity aria-hidden className="size-4 text-muted-foreground" />}
          label="已结束请求"
          value={formatTokens(snapshot.outcomes.finished)}
          hint={`调用成功率 ${successRate}`}
        />
        <UsageMetricCard
          icon={<Sparkles aria-hidden className="size-4 text-muted-foreground" />}
          label="主力模型"
          value={topModel ? topModel.name : '-'}
          hint={topModel ? `占比 ${sharePercent(topModelTotal, snapshot.summary.totalTokens)}%` : '暂无调用'}
          compactValue
        />
        <UsageMetricCard
          icon={<Cpu aria-hidden className="size-4 text-muted-foreground" />}
          label="日均 Token"
          value={formatCompactTokens(dailyAverageTokens)}
          hint={`覆盖 ${snapshot.models.length} 款受管模型`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="border-b pb-4">
            <CardTitle render={<h2 />} className="text-base">模型用量分布</CardTitle>
            <CardDescription>
              按 {label} 实测 Token 总量排序
            </CardDescription>
          </CardHeader>
          <CardPanel className="space-y-5 pt-5">
            <div
              aria-label="模型用量占比条"
              className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
            >
              {snapshot.models.map((model, index) => {
                const modelTotal = model.totalTokens;
                const pct = sharePercent(modelTotal, snapshot.summary.totalTokens);
                return (
                  <div
                    key={model.id}
                    title={`${model.name} (${pct}%)`}
                    style={{ width: `${pct}%` }}
                    className={cn('h-full transition-all', MODEL_COLORS[index % MODEL_COLORS.length])}
                  />
                );
              })}
            </div>

            <div className="space-y-4">
              {snapshot.models.length === 0 ? <p className="text-sm text-muted-foreground">暂无模型用量</p> : null}
              {snapshot.models.map((model, index) => {
                const modelTotal = model.totalTokens;
                const pct = sharePercent(modelTotal, snapshot.summary.totalTokens);
                return (
                  <div key={model.id} className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', MODEL_COLORS[index % MODEL_COLORS.length])} />
                        <span className="truncate font-medium text-foreground">{model.name}</span>
                        <Badge variant="outline" size="sm" className="hidden font-mono sm:inline-flex">
                          {model.alias}
                        </Badge>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 font-mono text-xs tabular-nums">
                        <span className="text-muted-foreground">{formatTokens(model.requests)} 次</span>
                        <span className="font-semibold text-foreground">{formatCompactTokens(modelTotal)}</span>
                        <span className="w-12 text-right text-muted-foreground">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        style={{ width: `${pct}%` }}
                        className={cn('h-full rounded-full transition-all', MODEL_COLORS[index % MODEL_COLORS.length])}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>输入 {formatCompactTokens(model.inputTokens)} · 输出 {formatCompactTokens(model.outputTokens)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardPanel>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="border-b pb-4">
            <CardTitle render={<h2 />} className="text-base">消耗趋势</CardTitle>
            <CardDescription>{label}每日实测 Token</CardDescription>
          </CardHeader>
          <CardPanel className="flex flex-col justify-between gap-4 pt-5">
            <div className={cn('flex h-48 items-end pt-4', snapshot.dailyTrend.length > 14 ? 'gap-px' : 'gap-1.5')}>
              {snapshot.dailyTrend.map((point, index) => {
                const heightPct = maxDailyTokens ? (point.tokens / maxDailyTokens) * 100 : 0;
                const showLabel = index % labelStep === 0;
                const date = formatShortDate(point.date);
                return (
                  <div
                    key={point.date}
                    className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                  >
                    <span className="font-mono text-[10px] text-muted-foreground tabular-nums opacity-80 group-hover:opacity-100">
                      {labelStep === 1 ? formatCompactTokens(point.tokens) : null}
                    </span>
                    <div
                      title={`${point.date} · ${formatTokens(point.tokens)} Tokens`}
                      style={{ height: `${heightPct}%` }}
                      className="w-full max-w-9 rounded-t-md bg-primary/80 transition-colors group-hover:bg-primary"
                    />
                    <span className="relative h-4 w-full text-[10px] text-muted-foreground">
                      {showLabel ? <span className="absolute left-0 whitespace-nowrap">{date}</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>
            <Separator />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>单日峰值</span>
              <span className="font-mono font-medium text-foreground tabular-nums">
                {formatCompactTokens(maxDailyTokens)} Tokens
              </span>
            </div>
          </CardPanel>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-base font-semibold text-foreground">近期调用明细</h2>
          <span className="text-xs text-muted-foreground">
            {snapshot.summary.unmeasuredRequests > 0
              ? `${formatTokens(snapshot.summary.unmeasuredRequests)} 次调用用量未知`
              : `${formatTokens(snapshot.summary.requests)} 条用量记录`}
          </span>
        </div>
        <ProductDataTable
          ariaLabel="近期调用明细"
          className="flex-none"
          columns={recentCallColumns}
          data={recentCalls}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          error={error}
          onLoadMore={onLoadMore}
          onRetry={onRetry}
          emptyText="暂无个人调用明细"
          filter={{
            columnId: 'status',
            label: '全部状态',
            options: [
              { label: '已计量', value: 'SETTLED' },
              { label: '用量未知', value: 'CHARGED_MAX' }
            ]
          }}
          getRowId={(row) => row.id}
          searchPlaceholder="搜索模型名称或别名"
        />
      </section>
    </>
  );
}

function UsageMetricCard({
  icon,
  label,
  value,
  hint,
  compactValue = false
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  compactValue?: boolean;
}) {
  return (
    <Card className="gap-2 p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div
        className={cn(
          'truncate font-semibold tracking-tight text-foreground',
          compactValue ? 'text-lg' : 'font-mono text-2xl tabular-nums'
        )}
      >
        {value}
      </div>
      <div className="truncate text-xs text-muted-foreground">{hint}</div>
    </Card>
  );
}
