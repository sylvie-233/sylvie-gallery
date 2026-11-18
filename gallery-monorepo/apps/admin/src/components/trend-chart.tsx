import { Link } from 'react-router-dom';

import type { AdminTrend, TrendMode } from '@sylvie/types';

import { formatYuan } from '@/lib/date';

const MODE_LABELS: Record<TrendMode, string> = {
  '7d': '近 7 天',
  '30d': '近一个月',
  '6m': '近六个月',
};

export function TrendChart({
  trend,
  mode,
  onModeChange,
}: {
  trend: AdminTrend | undefined;
  mode: TrendMode;
  onModeChange: (mode: TrendMode) => void;
}) {
  const points = trend?.points ?? [];
  const max = Math.max(1, ...points.map((point) => point.valueCents));
  const dense = mode === '30d';
  const isMonth = mode === '6m';

  return (
    <div className="panel flex h-full flex-col">
      <div className="p-title">
        <span>营收趋势</span>
        <span className="n">现金订单 · 与支付流水同口径</span>
        <div className="tabs ml-3">
          {(Object.keys(MODE_LABELS) as TrendMode[]).map((value) => (
            <button
              key={value}
              type="button"
              className={mode === value ? 'on' : ''}
              onClick={() => onModeChange(value)}
            >
              {MODE_LABELS[value]}
            </button>
          ))}
        </div>
        <Link to="/payments" className="ml-auto text-[12px] text-t3 transition hover:text-brand2">
          查看支付流水 ›
        </Link>
      </div>

      <div className="trend-bars">
        {points.length === 0
          ? Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="trend-bar-wrap">
                <div className="bar zero" style={{ height: '3px' }} />
              </div>
            ))
          : points.map((point, index) => {
              const showLabel =
                !dense || index === 0 || index === points.length - 1 || index % 5 === 0;
              return (
                <div
                  key={point.date}
                  className={`trend-bar-wrap ${dense ? 'dense' : ''}`}
                  title={`${point.date} ${formatYuan(point.valueCents)}`}
                >
                  {!dense ? (
                    <span className="val">
                      {point.valueCents > 0 ? formatYuan(point.valueCents) : ''}
                    </span>
                  ) : null}
                  <div
                    className={`bar ${point.valueCents === 0 ? 'zero' : ''}`}
                    style={{
                      height: `${Math.max(3, Math.round((point.valueCents / max) * 100))}%`,
                    }}
                  />
                  <span className={`lbl ${showLabel ? '' : 'hidden-lbl'}`}>{point.label}</span>
                </div>
              );
            })}
      </div>

      <div className="mt-auto grid grid-cols-3 border-t border-line">
        <div className="border-r border-line px-4 py-3">
          <span className="block text-[11px] text-t3">
            {isMonth ? '近六个月合计' : mode === '30d' ? '近一个月合计' : '近 7 天合计'}
          </span>
          <b className="mt-1 block text-[15px] tabular-nums">{formatYuan(trend?.sumCents ?? 0)}</b>
        </div>
        <div className="border-r border-line px-4 py-3">
          <span className="block text-[11px] text-t3">{isMonth ? '月均' : '日均'}</span>
          <b className="mt-1 block text-[15px] tabular-nums">{formatYuan(trend?.avgCents ?? 0)}</b>
        </div>
        <div className="px-4 py-3">
          <span className="block text-[11px] text-t3">
            {isMonth ? '单月最高' : '单日最高'}
          </span>
          <b className="mt-1 block text-[15px] tabular-nums">
            {formatYuan(trend?.maxCents ?? 0)}
            <span className="ml-1 text-[10.5px] font-normal text-t3">{trend?.maxLabel ?? ''}</span>
          </b>
        </div>
      </div>
    </div>
  );
}
