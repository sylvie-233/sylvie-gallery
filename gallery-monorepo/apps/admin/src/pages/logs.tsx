import { useState } from 'react';
import useSWR from 'swr';
import { MousePointerClick } from 'lucide-react';

import {
  ADMIN_ACTION_GROUPS,
  ADMIN_ACTION_LABELS,
  type AdminLogRow,
  type PageResult,
} from '@sylvie/types';

import {
  Badge,
  Empty,
  LoadingRows,
  Modal,
  PageError,
  PageHead,
  Pagination,
  SearchBox,
  TimeRangePicker,
} from '@/components/ui';
import { adminFetch } from '@/lib/api';
import { useAdminAuth } from '@/lib/auth';
import { formatDateTime, rangeQuery, type TimeRange } from '@/lib/date';

function prettyDetail(detail: string | null): string {
  if (!detail) return '—';
  try {
    return JSON.stringify(JSON.parse(detail), null, 2);
  } catch {
    return detail;
  }
}

export function LogsPage() {
  const { token } = useAdminAuth();
  const [action, setAction] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [range, setRange] = useState<TimeRange>({ quick: 'all', from: '', to: '' });
  const [active, setActive] = useState<AdminLogRow | null>(null);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', '8');
  if (action) params.set('action', action);
  if (keyword) params.set('keyword', keyword);
  const rangeParams = rangeQuery(range);
  if (rangeParams) {
    new URLSearchParams(rangeParams).forEach((value, key) => params.set(key, value));
  }

  const { data, error, isLoading, mutate } = useSWR<PageResult<AdminLogRow>>(
    token ? [`/logs?${params.toString()}`, token] : null,
    () => adminFetch<PageResult<AdminLogRow>>(`/logs?${params.toString()}`),
  );

  return (
    <div>
      <PageHead
        title="操作日志"
        sub={data ? `共 ${data.total} 条 · 最新在前` : '管理员操作留痕'}
      />

      <div className="panel">
        <div className="toolbar">
          <select
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
            className="h-9 min-w-[160px]"
          >
            <option value="">全部动作</option>
            {ADMIN_ACTION_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.actions.map((item) => (
                  <option key={item} value={item}>
                    {ADMIN_ACTION_LABELS[item] ?? item}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="sp" />
          <SearchBox
            value={keywordInput}
            onChange={setKeywordInput}
            onSearch={() => {
              setKeyword(keywordInput.trim());
              setPage(1);
            }}
            placeholder="搜索动作 / 目标 / 详情"
          />
        </div>
        <div className="toolbar">
          <TimeRangePicker
            value={range}
            onChange={(next) => {
              setRange(next);
              setPage(1);
            }}
          />
        </div>

        {isLoading && !data ? (
          <LoadingRows />
        ) : error && !data ? (
          <PageError message="操作日志加载失败" onRetry={() => mutate()} />
        ) : data && data.list.length > 0 ? (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>操作人</th>
                  <th>动作</th>
                  <th>目标</th>
                  <th className="hide-m">详情</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.list.map((log) => (
                  <tr key={log.id} className="cursor-pointer" onClick={() => setActive(log)}>
                    <td className="whitespace-nowrap text-[12px] tabular-nums text-t3">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="text-[12.5px] text-t2">{log.adminName}</td>
                    <td>
                      <Badge tone="brand">{log.actionLabel}</Badge>
                    </td>
                    <td className="text-[12px] text-t3">
                      {log.targetType ? `${log.targetType}${log.targetId ? ` #${log.targetId}` : ''}` : '—'}
                    </td>
                    <td className="hide-m max-w-[320px] truncate text-[11.5px] text-t3">
                      {log.detail ?? '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-t1"
                        onClick={(event) => {
                          event.stopPropagation();
                          setActive(log);
                        }}
                      >
                        <MousePointerClick size={11} />
                        详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </>
        ) : (
          <Empty title="暂无操作日志" text="管理操作发生后将自动记录在这里。" />
        )}
      </div>

      <Modal
        open={active !== null}
        title="操作日志详情"
        onClose={() => setActive(null)}
        width={640}
      >
        {active ? (
          <div className="space-y-3 text-[12.5px]">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-line bg-panel2 px-3.5 py-2.5">
                <p className="text-[11px] text-t3">日志编号</p>
                <p className="mt-1 mono">#{active.id}</p>
              </div>
              <div className="rounded-lg border border-line bg-panel2 px-3.5 py-2.5">
                <p className="text-[11px] text-t3">时间</p>
                <p className="mt-1 mono">{formatDateTime(active.createdAt)}</p>
              </div>
              <div className="rounded-lg border border-line bg-panel2 px-3.5 py-2.5">
                <p className="text-[11px] text-t3">操作人</p>
                <p className="mt-1">{active.adminName}</p>
              </div>
              <div className="rounded-lg border border-line bg-panel2 px-3.5 py-2.5">
                <p className="text-[11px] text-t3">来源 IP</p>
                <p className="mt-1 mono">{active.ip ?? '—'}</p>
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panel2 px-3.5 py-2.5">
              <p className="text-[11px] text-t3">动作</p>
              <p className="mt-1">
                <Badge tone="brand">{active.actionLabel}</Badge>
                <code className="ml-2 text-[11.5px] text-t3">{active.action}</code>
              </p>
            </div>
            <div className="rounded-lg border border-line bg-panel2 px-3.5 py-2.5">
              <p className="text-[11px] text-t3">目标</p>
              <p className="mt-1">
                {active.targetType ?? '—'}
                {active.targetId ? ` #${active.targetId}` : ''}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-panel2 px-3.5 py-2.5">
              <p className="text-[11px] text-t3">完整详情</p>
              <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11.5px] leading-relaxed text-t2">
                {prettyDetail(active.detail)}
              </pre>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
