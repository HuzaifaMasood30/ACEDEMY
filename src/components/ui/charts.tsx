'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn, formatMoney, formatNumber } from '@/lib/format';

/**
 * Formatting is declared, not passed as a callback: server components cannot
 * hand a function to a client component, and a closed set of formats is
 * clearer at the call site anyway.
 */
export type ValueFormat =
  | { kind: 'number' }
  | { kind: 'percent'; digits?: number }
  | { kind: 'money'; currency: string; compact?: boolean };

function formatValue(value: number | string, format?: ValueFormat): string {
  if (!format) return String(value);
  const numeric = typeof value === 'number' ? value : Number(value);

  switch (format.kind) {
    case 'money':
      return formatMoney(numeric, format.currency, { compact: format.compact });
    case 'percent':
      return `${numeric.toFixed(format.digits ?? 1)}%`;
    default:
      return formatNumber(numeric);
  }
}

/**
 * Chart primitives.
 *
 * Colours are read from the theme's CSS custom properties at render time so the
 * charts follow light and dark mode without a second palette definition.
 */

const SERIES_VARS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
];

function useThemeColors() {
  const [colors, setColors] = React.useState<{
    series: string[];
    grid: string;
    axis: string;
    surface: string;
    ink: string;
    line: string;
  }>(() => ({
    series: SERIES_VARS,
    grid: 'var(--line)',
    axis: 'var(--ink-subtle)',
    surface: 'var(--surface-raised)',
    ink: 'var(--ink)',
    line: 'var(--line)',
  }));

  React.useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;

    setColors({
      series: SERIES_VARS.map((v) => read(v, '#6366f1')),
      grid: read('--line', '#e4e4e7'),
      axis: read('--ink-subtle', '#71717a'),
      surface: read('--surface-raised', '#ffffff'),
      ink: read('--ink', '#18181b'),
      line: read('--line', '#e4e4e7'),
    });
  }, []);

  return colors;
}

const AXIS_STYLE = { fontSize: 11 } as const;

function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
  format?: ValueFormat;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 shadow-[var(--shadow-md)]">
      {label !== undefined && (
        <p className="mb-1 text-xs font-semibold text-[var(--ink)]">{label}</p>
      )}
      <ul className="space-y-0.5">
        {payload.map((entry, index) => (
          <li key={index} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden
            />
            <span className="text-[var(--ink-muted)]">{entry.name}</span>
            <span className="tabular ml-auto font-medium text-[var(--ink)]">
              {formatValue(entry.value ?? 0, format)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface TrendSeries {
  key: string;
  name: string;
  colorIndex?: number;
}

/** Multi-series area chart used for enrolment and collection trends. */
export function TrendChart({
  data,
  xKey,
  series,
  height = 260,
  format,
  className,
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: TrendSeries[];
  height?: number;
  format?: ValueFormat;
  className?: string;
}) {
  const colors = useThemeColors();

  if (data.length === 0) {
    return <ChartEmpty height={height} />;
  }

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            {series.map((entry, index) => (
              <linearGradient
                key={entry.key}
                id={`grad-${entry.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor={colors.series[entry.colorIndex ?? index] ?? colors.series[0]}
                  stopOpacity={0.28}
                />
                <stop
                  offset="95%"
                  stopColor={colors.series[entry.colorIndex ?? index] ?? colors.series[0]}
                  stopOpacity={0.02}
                />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={AXIS_STYLE}
            stroke={colors.axis}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={AXIS_STYLE}
            stroke={colors.axis}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip content={<ChartTooltip format={format} />} />
          {series.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: 11, color: colors.axis }}
              iconType="circle"
              iconSize={7}
            />
          )}
          {series.map((entry, index) => (
            <Area
              key={entry.key}
              type="monotone"
              dataKey={entry.key}
              name={entry.name}
              stroke={colors.series[entry.colorIndex ?? index] ?? colors.series[0]}
              strokeWidth={2}
              fill={`url(#grad-${entry.key})`}
              dot={false}
              activeDot={{ r: 3.5 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bar chart for comparisons such as class performance. */
export function ComparisonBarChart({
  data,
  xKey,
  series,
  height = 300,
  layout = 'vertical',
  format,
  className,
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: TrendSeries[];
  height?: number;
  layout?: 'vertical' | 'horizontal';
  format?: ValueFormat;
  className?: string;
}) {
  const colors = useThemeColors();

  if (data.length === 0) return <ChartEmpty height={height} />;

  const vertical = layout === 'vertical';

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={layout}
          margin={{ top: 8, right: 16, left: vertical ? 4 : -12, bottom: 0 }}
          barCategoryGap="22%"
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={colors.grid}
            vertical={!vertical}
            horizontal={vertical}
          />
          {vertical ? (
            <>
              <XAxis
                type="number"
                tick={AXIS_STYLE}
                stroke={colors.axis}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey={xKey}
                tick={AXIS_STYLE}
                stroke={colors.axis}
                tickLine={false}
                axisLine={false}
                width={104}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={xKey}
                tick={AXIS_STYLE}
                stroke={colors.axis}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={AXIS_STYLE}
                stroke={colors.axis}
                tickLine={false}
                axisLine={false}
                width={48}
              />
            </>
          )}
          <Tooltip
            content={<ChartTooltip format={format} />}
            cursor={{ fill: colors.grid, fillOpacity: 0.35 }}
          />
          {series.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: 11, color: colors.axis }}
              iconType="circle"
              iconSize={7}
            />
          )}
          {series.map((entry, index) => (
            <Bar
              key={entry.key}
              dataKey={entry.key}
              name={entry.name}
              fill={colors.series[entry.colorIndex ?? index] ?? colors.series[0]}
              radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              maxBarSize={26}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Donut chart for part-to-whole figures such as attendance breakdown. */
export function DonutChart({
  data,
  height = 240,
  centerLabel,
  centerValue,
  format,
  className,
}: {
  data: Array<{ name: string; value: number; colorIndex?: number }>;
  height?: number;
  centerLabel?: string;
  centerValue?: string;
  format?: ValueFormat;
  className?: string;
}) {
  const colors = useThemeColors();
  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  if (total === 0) return <ChartEmpty height={height} />;

  return (
    <div className={cn('relative w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={colors.series[entry.colorIndex ?? index] ?? colors.series[0]}
              />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip format={format} />} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: colors.axis }}
            iconType="circle"
            iconSize={7}
          />
        </PieChart>
      </ResponsiveContainer>

      {(centerLabel || centerValue) && (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] -translate-y-1/2 text-center">
          {centerValue && (
            <p className="tabular text-2xl font-semibold tracking-tight text-[var(--ink)]">
              {centerValue}
            </p>
          )}
          {centerLabel && (
            <p className="mt-0.5 text-[0.6875rem] text-[var(--ink-subtle)]">{centerLabel}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Line chart for per-student examination progress. */
export function ProgressLineChart({
  data,
  xKey,
  series,
  height = 240,
  format,
  domain,
  className,
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  series: TrendSeries[];
  height?: number;
  format?: ValueFormat;
  domain?: [number | 'auto', number | 'auto'];
  className?: string;
}) {
  const colors = useThemeColors();

  if (data.length === 0) return <ChartEmpty height={height} />;

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={AXIS_STYLE}
            stroke={colors.axis}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={AXIS_STYLE}
            stroke={colors.axis}
            tickLine={false}
            axisLine={false}
            width={48}
            domain={domain ?? [0, 100]}
          />
          <Tooltip content={<ChartTooltip format={format} />} />
          {series.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: 11, color: colors.axis }}
              iconType="circle"
              iconSize={7}
            />
          )}
          {series.map((entry, index) => (
            <Line
              key={entry.key}
              type="monotone"
              dataKey={entry.key}
              name={entry.name}
              stroke={colors.series[entry.colorIndex ?? index] ?? colors.series[0]}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Compact radial gauge for a single percentage figure. */
export function GaugeChart({
  value,
  label,
  height = 160,
  tone = 'brand',
  className,
}: {
  value: number;
  label?: string;
  height?: number;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const colors = useThemeColors();

  const toneIndex = { brand: 0, success: 3, warning: 4, danger: 5 }[tone];
  const clamped = Math.max(0, Math.min(100, value));

  const data = [{ name: label ?? 'Value', value: clamped, fill: colors.series[toneIndex] }];

  return (
    <div className={cn('relative w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          innerRadius="70%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={8} background={{ fill: colors.grid }} />
        </RadialBarChart>
      </ResponsiveContainer>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="tabular text-xl font-semibold tracking-tight text-[var(--ink)]">
          {clamped.toFixed(1)}%
        </p>
        {label && <p className="text-[0.6875rem] text-[var(--ink-subtle)]">{label}</p>}
      </div>
    </div>
  );
}

function ChartEmpty({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed border-[var(--line)] text-xs text-[var(--ink-subtle)]"
      style={{ height }}
    >
      Not enough data to chart yet
    </div>
  );
}
