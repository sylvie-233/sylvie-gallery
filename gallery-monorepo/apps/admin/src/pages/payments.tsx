import { useState } from 'react';
import useSWR from 'swr';
import { Download, RotateCcw } from 'lucide-react';

import type { AdminOrderPage, AdminOrderRow } from '@sylvie/types';
import { formatCount } from '@sylvie/utils';

import {
  Badge,
  Empty,
  LoadingRows,
  PageError,
  PageHead,
  Pagination,
  SearchBox,
  Tabs,
  TimeRangePicker,
} from '@/components/ui';
import { adminDownload, adminFetch } from '@/lib/api';
import { useAdminAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import { formatDateTime, formatYuan, rangeQuery, type TimeRange } from '@/lib/date';
import { useToast } from '@/lib/toast';

type PaymentView = 'all' | 'vip' | 'unlock' | 'created' | 'refunded';

const VIEW_ITEMS: Array<{ value: PaymentView; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'vip', label: '会员开通' },
  { value: 'unlock', label: '积分解锁' },
  { value: 'created', label: '待支付' },
  { value: 'refunded', label: '已退款' },
];

const STATUS_BADGE: Record<string, { tone: 'green' | 'amber' | 'red' | 'gray'; label: string }> = {
  paid: { tone: 'green', label: '已支付' },
  created: { tone: 'amber', label: '待支付' },
  refunded: { tone: 'red', label: '已退款' },
  closed: { tone: 'gray', label: '已关闭' },
};

function viewQuery(view: PaymentView): { biz: string; status: string } {
  if (view === 'vip') return { biz: 'vip', status: 'all' };
  if (view === 'unlock') return { biz: 'unlock', status: 'all' };
  if (view === 'created') return { biz: 'all', status: 'created' };
  if (view === 'refunded') return { biz: 'all', status: 'refunded' };
  return { biz: 'all', status: 'all' };
}

export function PaymentsPage() {
  const { token, revalidateAll } = useAdminAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const [view, setView] = useState<PaymentView>('all');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [range, setRange] = useState<TimeRange>({ quick: 'all', from: '', to: '' });
  const [exporting, setExporting] = useState(false);

  const query = viewQuery(view);
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', '8');
  if (query.biz !== 'all') params.set('biz', query.biz);
  if (query.status !== 'all') params.set('status', query.status);
  if (keyword) params.set('keyword', keyword);
  const rangeParams = rangeQuery(range);
  if (rangeParams) {
    new URLSearchParams(rangeParams).forEach((value, key) => params.set(key, value));
  }

  const { data, error, isLoading, mutate } = useSWR<AdminOrderPage>(
    token ? [`/orders?${params.toString()}`, token] : null,
    () => adminFetch<AdminOrderPage>(`/orders?${params.toString()}`),
  );

  const resetPage = () => setPage(1);

  const refund = async (order: AdminOrderRow) => {
    const ok = await confirm({
      title: '确认退款？',
      text: `订单 ${order.orderNo}\n用户：${order.user.nickname}（${order.user.email}）\n金额：${formatYuan(order.amountCents)}\n退款后该用户的付费会员权益将同步收回。`,
      okText: '确认退款',
    });
    if (!ok) return;
    try {
      await adminFetch(`/orders/${order.id}/refund`, {
        method: 'POST',
        body: { reason: '管理员操作退款' },
      });
      toast('订单已退款，会员权益已收回', 'success');
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '退款失败', 'error');
    }
  };

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const ok = await adminDownload(
        `/orders/export?${params.toString()}`,
        `sylvie-pay-${Date.now()}.csv`,
      );
      if (ok) {
        toast('支付流水已导出', 'success');
        void revalidateAll();
      }
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '导出失败', 'error');
    } finally {
      setExporting(false);
    }
  };

  const summary = data?.summary;

  return (
    <div>
      <PageHead
        title="支付流水"
        sub={data ? `共 ${data.total} 笔 · 第 ${data.page} / ${data.totalPages} 页` : ''}
      >
        <button type="button" className="btn btn-green" onClick={exportCsv} disabled={exporting}>
          <Download size={14} />
          {exporting ? '导出中…' : '导出 CSV'}
        </button>
      </PageHead>

      <div className="mb-4 grid grid-cols-4 gap-3">
        {[
          {
            label: '累计营收',
            value: formatYuan(summary?.totalRevenueCents ?? 0),
            desc: '会员 + 解锁全部现金收入',
            red: true,
          },
          {
            label: '今日营收',
            value: formatYuan(summary?.todayRevenueCents ?? 0),
            desc: `今日 ${summary?.todayOrderCount ?? 0} 笔`,
          },
          {
            label: '会员订单',
            value: formatCount(summary?.vipOrderCount ?? 0),
            desc: formatYuan(summary?.vipCashCents ?? 0),
          },
          {
            label: '积分解锁',
            value: formatCount(summary?.unlockCount ?? 0),
            desc: `消耗 ${summary?.unlockPoints ?? 0} 积分`,
          },
        ].map((item) => (
          <div key={item.label} className="stat-card panel px-4 py-3.5">
            <p className="text-[12px] text-t3">{item.label}</p>
            <p
              className={`mt-1.5 text-[23px] font-extrabold leading-none tabular-nums ${
                item.red ? 'text-brand2' : ''
              }`}
            >
              {item.value}
            </p>
            <p className="mt-1.5 text-[11px] text-t3">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="toolbar">
          <Tabs
            items={VIEW_ITEMS}
            value={view}
            onChange={(next) => {
              setView(next);
              resetPage();
            }}
          />
          <div className="sp" />
          <SearchBox
            value={keywordInput}
            onChange={setKeywordInput}
            onSearch={() => {
              setKeyword(keywordInput.trim());
              resetPage();
            }}
            placeholder="搜索订单号 / 用户昵称"
          />
        </div>
        <div className="toolbar">
          <TimeRangePicker
            value={range}
            onChange={(next) => {
              setRange(next);
              resetPage();
            }}
          />
        </div>

        {isLoading && !data ? (
          <LoadingRows rows={5} />
        ) : error && !data ? (
          <PageError message="支付流水加载失败" onRetry={() => mutate()} />
        ) : data && data.list.length > 0 ? (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>订单号</th>
                  <th>用户</th>
                  <th>业务</th>
                  <th>图集 / 套餐</th>
                  <th className="hide-m">支付方式</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th className="hide-m">支付时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.list.map((order) => {
                  const status = STATUS_BADGE[order.status] ?? {
                    tone: 'gray' as const,
                    label: order.status,
                  };
                  return (
                    <tr key={order.id}>
                      <td className="mono text-[11.5px] text-t2">{order.orderNo}</td>
                      <td>
                        <div>
                          <p className="text-[12.5px]">{order.user.nickname}</p>
                          <p className="mt-0.5 text-[10.5px] text-t3">{order.user.email}</p>
                        </div>
                      </td>
                      <td>
                        {order.bizType === 'vip' ? (
                          <Badge tone="brand">会员开通</Badge>
                        ) : (
                          <Badge tone="gray">积分解锁</Badge>
                        )}
                      </td>
                      <td className="max-w-[200px] truncate text-[12.5px] text-t2">
                        {order.bizType === 'vip' ? (order.planName ?? '付费会员') : (order.albumTitle ?? '—')}
                      </td>
                      <td className="hide-m text-[12px] text-t3">
                        {order.payType === 'alipay'
                          ? '支付宝'
                          : order.payType === 'points'
                            ? `${order.pointsCost} 积分`
                            : '管理员赠送'}
                      </td>
                      <td className="text-[12.5px] font-semibold tabular-nums text-brand2">
                        {order.amountCents > 0
                          ? formatYuan(order.amountCents)
                          : order.pointsCost > 0
                            ? `${order.pointsCost} 分`
                            : '¥0'}
                      </td>
                      <td>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td className="hide-m text-[12px] tabular-nums text-t3">
                        {formatDateTime(order.paidAt)}
                      </td>
                      <td>
                        {order.status === 'paid' && order.bizType === 'vip' ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-brand2"
                            onClick={() => refund(order)}
                          >
                            <RotateCcw size={11} />
                            退款
                          </button>
                        ) : (
                          <span className="text-[11.5px] text-t3">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </>
        ) : (
          <Empty title="没有符合条件的订单" text="换个筛选条件或时间范围试试。" />
        )}
      </div>
    </div>
  );
}
