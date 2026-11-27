/**
 * [INPUT]: 依赖 coss UI Card/Tabs/Popover/Field/Input/Button/Badge/Separator、共享 ProductDataTable（TableStackCell / TableStatusBadge）与静态时间窗口示例数据集。
 * [OUTPUT]: 提供面向全部已登录成员的静态占位页 `PersonalUsagePage`，支持近 7 天/近 30 天/本月/自定义日期区间切换，展示个人用量 KPI、模型用量分布条、消耗趋势与统一 ProductDataTable 近期调用明细。
 * [POS]: features/usage 的个人用量工作台，作为全角色共用的「个人 -> 用量」入口与普通员工默认首页，待后续接入个人统计接口。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Activity, CalendarRange, Cpu, Layers, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
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

type ModelShareItem = {
  id: string;
  name: string;
  alias: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  barClass: string;
  dotClass: string;
};

type DailyTrendItem = {
  label: string;
  tokens: number;
};

type RecentCallItem = {
  id: string;
  time: string;
  modelName: string;
  modelAlias: string;
  inputTokens: number;
  outputTokens: number;
  status: '已完成' | '已降级';
  tone: 'success' | 'warning';
};

type UsageSnapshot = {
  label: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalRequests: number;
  successRate: string;
  dailyAverageTokens: number;
  models: readonly ModelShareItem[];
  dailyTrend: readonly DailyTrendItem[];
  recentCalls: readonly RecentCallItem[];
};

const USAGE_SNAPSHOTS: Record<PresetRangeKey, UsageSnapshot> = {
  '7d': {
    label: '近 7 天',
    totalTokens: 2_840_000,
    inputTokens: 2_120_000,
    outputTokens: 720_000,
    totalRequests: 614,
    successRate: '99.5%',
    dailyAverageTokens: 405_714,
    models: [
      { id: 'deepseek-v4', name: 'DeepSeek-V4.1-Flash', alias: 'deepseek-v4.1-flash', inputTokens: 1_120_000, outputTokens: 360_000, requests: 318, barClass: 'bg-sky-500', dotClass: 'bg-sky-500' },
      { id: 'sage-a15', name: 'Sage-A1.5', alias: 'sage-a1.5', inputTokens: 590_000, outputTokens: 205_000, requests: 172, barClass: 'bg-emerald-500', dotClass: 'bg-emerald-500' },
      { id: 'atria-dawn', name: 'Atria-Dawn', alias: 'atria-dawn', inputTokens: 280_000, outputTokens: 110_000, requests: 88, barClass: 'bg-amber-500', dotClass: 'bg-amber-500' },
      { id: 'agents-a1', name: 'Agents-A1', alias: 'agents-a1', inputTokens: 130_000, outputTokens: 45_000, requests: 36, barClass: 'bg-violet-500', dotClass: 'bg-violet-500' }
    ],
    dailyTrend: [
      { label: '03-21', tokens: 320_000 },
      { label: '03-22', tokens: 410_000 },
      { label: '03-23', tokens: 295_000 },
      { label: '03-24', tokens: 485_000 },
      { label: '03-25', tokens: 440_000 },
      { label: '03-26', tokens: 510_000 },
      { label: '03-27', tokens: 380_000 }
    ],
    recentCalls: [
      { id: 'call-1', time: '今天 11:18', modelName: 'DeepSeek-V4.1-Flash', modelAlias: 'deepseek-v4.1-flash', inputTokens: 12_400, outputTokens: 3_180, status: '已完成', tone: 'success' },
      { id: 'call-2', time: '今天 10:42', modelName: 'Sage-A1.5', modelAlias: 'sage-a1.5', inputTokens: 8_920, outputTokens: 2_450, status: '已完成', tone: 'success' },
      { id: 'call-3', time: '今天 09:55', modelName: 'Atria-Dawn', modelAlias: 'atria-dawn', inputTokens: 6_150, outputTokens: 1_920, status: '已完成', tone: 'success' },
      { id: 'call-4', time: '昨天 19:20', modelName: 'Agents-A1', modelAlias: 'agents-a1', inputTokens: 4_300, outputTokens: 860, status: '已降级', tone: 'warning' }
    ]
  },
  '30d': {
    label: '近 30 天',
    totalTokens: 11_480_000,
    inputTokens: 8_640_000,
    outputTokens: 2_840_000,
    totalRequests: 2_510,
    successRate: '99.2%',
    dailyAverageTokens: 382_667,
    models: [
      { id: 'deepseek-v4', name: 'DeepSeek-V4.1-Flash', alias: 'deepseek-v4.1-flash', inputTokens: 4_250_000, outputTokens: 1_390_000, requests: 1_240, barClass: 'bg-sky-500', dotClass: 'bg-sky-500' },
      { id: 'sage-a15', name: 'Sage-A1.5', alias: 'sage-a1.5', inputTokens: 2_480_000, outputTokens: 820_000, requests: 710, barClass: 'bg-emerald-500', dotClass: 'bg-emerald-500' },
      { id: 'atria-dawn', name: 'Atria-Dawn', alias: 'atria-dawn', inputTokens: 1_260_000, outputTokens: 420_000, requests: 382, barClass: 'bg-amber-500', dotClass: 'bg-amber-500' },
      { id: 'agents-a1', name: 'Agents-A1', alias: 'agents-a1', inputTokens: 650_000, outputTokens: 210_000, requests: 178, barClass: 'bg-violet-500', dotClass: 'bg-violet-500' }
    ],
    dailyTrend: [
      { label: '第 1 周', tokens: 2_310_000 },
      { label: '第 2 周', tokens: 2_890_000 },
      { label: '第 3 周', tokens: 3_440_000 },
      { label: '第 4 周', tokens: 2_840_000 }
    ],
    recentCalls: [
      { id: 'call-1', time: '今天 11:18', modelName: 'DeepSeek-V4.1-Flash', modelAlias: 'deepseek-v4.1-flash', inputTokens: 12_400, outputTokens: 3_180, status: '已完成', tone: 'success' },
      { id: 'call-2', time: '今天 10:42', modelName: 'Sage-A1.5', modelAlias: 'sage-a1.5', inputTokens: 8_920, outputTokens: 2_450, status: '已完成', tone: 'success' },
      { id: 'call-5', time: '3 天前', modelName: 'DeepSeek-V4.1-Flash', modelAlias: 'deepseek-v4.1-flash', inputTokens: 19_200, outputTokens: 4_810, status: '已完成', tone: 'success' }
    ]
  },
  month: {
    label: '本月',
    totalTokens: 9_920_000,
    inputTokens: 7_420_000,
    outputTokens: 2_500_000,
    totalRequests: 2_186,
    successRate: '99.4%',
    dailyAverageTokens: 367_407,
    models: [
      { id: 'sage-a15', name: 'Sage-A1.5', alias: 'sage-a1.5', inputTokens: 3_320_000, outputTokens: 1_140_000, requests: 980, barClass: 'bg-emerald-500', dotClass: 'bg-emerald-500' },
      { id: 'deepseek-v4', name: 'DeepSeek-V4.1-Flash', alias: 'deepseek-v4.1-flash', inputTokens: 2_840_000, outputTokens: 910_000, requests: 825, barClass: 'bg-sky-500', dotClass: 'bg-sky-500' },
      { id: 'atria-dawn', name: 'Atria-Dawn', alias: 'atria-dawn', inputTokens: 890_000, outputTokens: 310_000, requests: 265, barClass: 'bg-amber-500', dotClass: 'bg-amber-500' },
      { id: 'agents-a1', name: 'Agents-A1', alias: 'agents-a1', inputTokens: 370_000, outputTokens: 140_000, requests: 116, barClass: 'bg-violet-500', dotClass: 'bg-violet-500' }
    ],
    dailyTrend: [
      { label: '1 日', tokens: 260_000 },
      { label: '5 日', tokens: 340_000 },
      { label: '10 日', tokens: 420_000 },
      { label: '15 日', tokens: 390_000 },
      { label: '20 日', tokens: 495_000 },
      { label: '25 日', tokens: 470_000 }
    ],
    recentCalls: [
      { id: 'call-2', time: '今天 10:42', modelName: 'Sage-A1.5', modelAlias: 'sage-a1.5', inputTokens: 8_920, outputTokens: 2_450, status: '已完成', tone: 'success' },
      { id: 'call-1', time: '今天 11:18', modelName: 'DeepSeek-V4.1-Flash', modelAlias: 'deepseek-v4.1-flash', inputTokens: 12_400, outputTokens: 3_180, status: '已完成', tone: 'success' }
    ]
  }
};

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

function buildCustomSnapshot({ start, end }: CustomDateRange): UsageSnapshot {
  const days = Math.max(1, diffDaysInclusive(start, end));
  const scale = days / 7;
  const base = USAGE_SNAPSHOTS['7d'];
  const models: ModelShareItem[] = base.models.map((model) => ({
    ...model,
    inputTokens: Math.round(model.inputTokens * scale),
    outputTokens: Math.round(model.outputTokens * scale),
    requests: Math.max(1, Math.round(model.requests * scale))
  }));
  const inputTokens = models.reduce((sum, item) => sum + item.inputTokens, 0);
  const outputTokens = models.reduce((sum, item) => sum + item.outputTokens, 0);
  const totalTokens = inputTokens + outputTokens;
  const totalRequests = models.reduce((sum, item) => sum + item.requests, 0);

  const buckets = Math.min(days, 7);
  const step = Math.max(1, Math.floor((days - 1) / Math.max(1, buckets - 1)));
  const dailyTrend: DailyTrendItem[] = Array.from({ length: buckets }, (_, index) => {
    const offset = index === buckets - 1 ? days - 1 : index * step;
    const label = formatShortDate(shiftDateInput(start, offset));
    const wave = [0.84, 1.05, 0.91, 1.18, 0.96, 1.12, 0.94][index % 7] ?? 1;
    const bucketDays = index === buckets - 1 ? Math.max(1, days - offset) : step;
    return {
      label,
      tokens: Math.round((totalTokens / days) * bucketDays * wave)
    };
  });

  return {
    label: `${formatShortDate(start)} ~ ${formatShortDate(end)}`,
    totalTokens,
    inputTokens,
    outputTokens,
    totalRequests,
    successRate: base.successRate,
    dailyAverageTokens: Math.round(totalTokens / days),
    models,
    dailyTrend,
    recentCalls: base.recentCalls
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
    cell: ({ getValue }) => (
      <span className="block truncate font-mono text-xs tabular-nums">{formatTokens(Number(getValue()))}</span>
    ),
    meta: { label: '输入', className: 'w-[110px]', cellClassName: 'w-[110px]' }
  },
  {
    accessorKey: 'outputTokens',
    header: '输出',
    cell: ({ getValue }) => (
      <span className="block truncate font-mono text-xs tabular-nums">{formatTokens(Number(getValue()))}</span>
    ),
    meta: { label: '输出', className: 'w-[110px]', cellClassName: 'w-[110px]' }
  },
  {
    id: 'totalTokens',
    accessorFn: (row) => row.inputTokens + row.outputTokens,
    header: '总计',
    cell: ({ getValue }) => (
      <span className="block truncate font-mono text-xs font-medium tabular-nums">
        {formatTokens(Number(getValue()))}
      </span>
    ),
    meta: { label: '总计', className: 'w-[120px]', cellClassName: 'w-[120px]' }
  },
  {
    accessorKey: 'status',
    header: '状态',
    filterFn: 'equalsString',
    cell: ({ row }) => <TableStatusBadge label={row.original.status} tone={row.original.tone} />,
    meta: { label: '状态', className: 'w-[110px]', cellClassName: 'w-[110px]' }
  }
];

export function PersonalUsagePage() {
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

  const snapshot = useMemo(
    () => (range === 'custom' ? buildCustomSnapshot(customRange) : USAGE_SNAPSHOTS[range]),
    [customRange, range]
  );
  const topModel = snapshot.models[0];
  const topModelTotal = topModel ? topModel.inputTokens + topModel.outputTokens : 0;
  const maxDailyTokens = Math.max(...snapshot.dailyTrend.map((item) => item.tokens), 1);

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
    if (draftEnd > todayStr) {
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
              <Badge variant="outline" size="sm">
                示例数据 · 待接入个人用量接口
              </Badge>
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

        <section aria-label="关键用量指标" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <UsageMetricCard
            icon={<Layers aria-hidden className="size-4 text-muted-foreground" />}
            label={`${snapshot.label}总消耗`}
            value={formatCompactTokens(snapshot.totalTokens)}
            hint={`输入 ${formatCompactTokens(snapshot.inputTokens)} · 输出 ${formatCompactTokens(snapshot.outputTokens)}`}
          />
          <UsageMetricCard
            icon={<Activity aria-hidden className="size-4 text-muted-foreground" />}
            label="请求总次数"
            value={formatTokens(snapshot.totalRequests)}
            hint={`调用成功率 ${snapshot.successRate}`}
          />
          <UsageMetricCard
            icon={<Sparkles aria-hidden className="size-4 text-muted-foreground" />}
            label="主力模型"
            value={topModel ? topModel.name : '-'}
            hint={topModel ? `占比 ${sharePercent(topModelTotal, snapshot.totalTokens)}%` : '暂无调用'}
            compactValue
          />
          <UsageMetricCard
            icon={<Cpu aria-hidden className="size-4 text-muted-foreground" />}
            label="日均 Token"
            value={formatCompactTokens(snapshot.dailyAverageTokens)}
            hint={`覆盖 ${snapshot.models.length} 款受管模型`}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader className="border-b pb-4">
              <CardTitle render={<h2 />} className="text-base">模型用量分布</CardTitle>
              <CardDescription>
                按 {snapshot.label} 实测输入与输出 Token 合计占比排序
              </CardDescription>
            </CardHeader>
            <CardPanel className="space-y-5 pt-5">
              <div
                aria-label="模型用量占比条"
                className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
              >
                {snapshot.models.map((model) => {
                  const modelTotal = model.inputTokens + model.outputTokens;
                  const pct = sharePercent(modelTotal, snapshot.totalTokens);
                  return (
                    <div
                      key={model.id}
                      title={`${model.name} (${pct}%)`}
                      style={{ width: `${pct}%` }}
                      className={cn('h-full transition-all', model.barClass)}
                    />
                  );
                })}
              </div>

              <div className="space-y-4">
                {snapshot.models.map((model) => {
                  const modelTotal = model.inputTokens + model.outputTokens;
                  const pct = sharePercent(modelTotal, snapshot.totalTokens);
                  return (
                    <div key={model.id} className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <div className="flex min-w-0 items-center gap-2">
                          <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', model.dotClass)} />
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
                          className={cn('h-full rounded-full transition-all', model.barClass)}
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
              <CardDescription>{snapshot.label} 各统计周期 Token 起伏</CardDescription>
            </CardHeader>
            <CardPanel className="flex flex-col justify-between gap-4 pt-5">
              <div className="flex h-48 items-end gap-2.5 pt-4">
                {snapshot.dailyTrend.map((point) => {
                  const heightPct = Math.max(12, Math.round((point.tokens / maxDailyTokens) * 100));
                  return (
                    <div
                      key={point.label}
                      className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                    >
                      <span className="font-mono text-[10px] text-muted-foreground tabular-nums opacity-80 group-hover:opacity-100">
                        {formatCompactTokens(point.tokens)}
                      </span>
                      <div
                        title={`${point.label}：${formatTokens(point.tokens)} Tokens`}
                        style={{ height: `${heightPct}%` }}
                        className="w-full max-w-9 rounded-t-md bg-primary/80 transition-colors group-hover:bg-primary"
                      />
                      <span className="truncate text-[11px] text-muted-foreground">{point.label}</span>
                    </div>
                  );
                })}
              </div>
              <Separator />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>峰值周期消耗</span>
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
              仅预览当前账号最近几笔调用结构，正式版接入分页账本
            </span>
          </div>
          <ProductDataTable
            ariaLabel="近期调用明细"
            className="flex-none"
            columns={recentCallColumns}
            data={snapshot.recentCalls}
            emptyText="暂无个人调用明细"
            filter={{
              columnId: 'status',
              label: '全部状态',
              options: [
                { label: '已完成', value: '已完成' },
                { label: '已降级', value: '已降级' }
              ]
            }}
            getRowId={(row) => row.id}
            searchPlaceholder="搜索模型名称或别名"
          />
        </section>
      </div>
    </div>
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
