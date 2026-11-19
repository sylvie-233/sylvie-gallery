import { TIME_QUICK_LABELS, quickToRange, type TimeQuick, type TimeRange } from '@/lib/date';

interface TimeRangePickerProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
}

/** 后台时间筛选：快捷页签 + 自定义日期区间，依赖后台的日期工具。 */
export function TimeRangePicker({ value, onChange }: TimeRangePickerProps) {
  const quickItems: TimeQuick[] = ['all', 'today', '7', '30', 'custom'];

  const setQuick = (quick: TimeQuick) => {
    if (quick === 'custom') {
      onChange({ quick, from: value.from, to: value.to });
      return;
    }
    onChange({ quick, ...quickToRange(quick) });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="tabs">
        {quickItems.map((quick) => (
          <button
            key={quick}
            type="button"
            className={value.quick === quick ? 'on' : ''}
            onClick={() => setQuick(quick)}
          >
            {TIME_QUICK_LABELS[quick]}
          </button>
        ))}
      </div>
      {value.quick === 'custom' ? (
        <div className="flex items-center gap-2 text-[12px] text-t3">
          <input
            type="date"
            value={value.from}
            onChange={(event) => onChange({ ...value, quick: 'custom', from: event.target.value })}
            className="h-9"
          />
          <span>至</span>
          <input
            type="date"
            value={value.to}
            onChange={(event) => onChange({ ...value, quick: 'custom', to: event.target.value })}
            className="h-9"
          />
        </div>
      ) : null}
    </div>
  );
}
