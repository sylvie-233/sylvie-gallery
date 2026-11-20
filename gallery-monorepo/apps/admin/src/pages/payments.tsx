import { useState } from 'react';
import useSWR from 'swr';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  MousePointerClick,
  RotateCcw,
} from 'lucide-react';

import type { AdminOrderPage, AdminOrderRow } from '@sylvie/types';
import { formatCount } from '@sylvie/utils';

import {
  Badge,
  Empty,
  LoadingRows,
  Modal,
  PageError,
  PageHead,
  Pagination,
  SearchBox,
  Tabs,
  TimeRangePicker,
} from '@/components/ui';
import { adminDownload, adminFetch } from '@/lib/api';
import { useAdminAuth } from '@/lib/auth';
import { formatDateTime, formatYuan, rangeQuery, type TimeRange } from '@/lib/date';
import { useToast } from '@/lib/toast';

type PaymentView = 'all' | 'vip' | 'unlock' | 'created' | 'refunded';

/** 退款原因预设。 */
const REFUND_REASONS = ['用户申请退款', '重复购买', '服务问题', '其他'] as const;
type RefundReason = (typeof REFUND_REASONS)[number];

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

/** 状态徽章展示；未知状态回退为灰色徽章。 */
function statusBadge(status: string): { tone: 'green' | 'amber' | 'red' | 'gray'; label: string } {
  return STATUS_BADGE[status] ?? { tone: 'gray', label: status };
}

/** 金额展示：现金优先，其次积分，最后 ¥0。 */
function amountLabel(order: AdminOrderRow): string {
  if (order.amountCents > 0) {
    return formatYuan(order.amountCents);
  }
  if (order.pointsCost > 0) {
    return `${order.pointsCost} 分`;
  }
  return '¥0';
}

export function PaymentsPage() {
  const { token, revalidateAll } = useAdminAuth();
  const { toast } = useToast();

  const [view, setView] = useState<PaymentView>('all');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [range, setRange] = useState<TimeRange>({ quick: 'all', from: '', to: '' });
  const [exporting, setExporting] = useState(false);
  /** 详情弹窗：列表行已包含完整的订单 / 支付 / 退款字段，无需额外请求。 */
  const [detailTarget, setDetailTarget] = useState<AdminOrderRow | null>(null);

  // 退款弹窗：目标订单、原因、备注、提交状态、错误提示与成功结果。
  const [refundTarget, setRefundTarget] = useState<AdminOrderRow | null>(null);
  const [refundReason, setRefundReason] = useState<RefundReason>('用户申请退款');
  const [refundNote, setRefundNote] = useState('');
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState('');
  const [refundDone, setRefundDone] = useState<{ reason: string } | null>(null);

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

  const openRefund = (order: AdminOrderRow) => {
    setRefundTarget(order);
    setRefundReason('用户申请退款');
    setRefundNote('');
    setRefundError('');
    setRefundDone(null);
    setRefunding(false);
  };

  const closeRefund = () => {
    if (refunding) {
      return;
    }
    setRefundTarget(null);
    setRefundError('');
    setRefundDone(null);
  };

  const submitRefund = async () => {
    if (!refundTarget || refunding) {
      return;
    }
    const note = refundNote.trim();
    if (refundReason === '其他' && !note) {
      setRefundError('选择「其他」时请填写退款说明');
      return;
    }
    const reason = note ? `${refundReason}：${note}` : refundReason;

    setRefunding(true);
    setRefundError('');
    try {
      await adminFetch(`/orders/${refundTarget.id}/refund`, {
        method: 'POST',
        body: { reason: reason.slice(0, 255) },
      });
      // 保留弹窗展示成功结果，列表在后台刷新。
      setRefundDone({ reason });
      toast('订单已退款，会员权益已收回', 'success');
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      // 失败时保留表单与填写内容，便于调整后重试；后端保证本地状态未变更。
      setRefundError(
        requestError instanceof Error ? requestError.message : '退款失败，请稍后重试',
      );
    } finally {
      setRefunding(false);
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
                    <tr
                      key={order.id}
                      className="cursor-pointer"
                      title="点击查看订单详情"
                      onClick={() => setDetailTarget(order)}
                    >
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
                        {amountLabel(order)}
                      </td>
                      <td>
                        <span
                          title={
                            order.status === 'refunded'
                              ? [
                                  order.refundReason ? `原因：${order.refundReason}` : '',
                                  order.refundAt ? `退款时间：${formatDateTime(order.refundAt)}` : '',
                                ]
                                  .filter(Boolean)
                                  .join('\n')
                              : undefined
                          }
                        >
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </span>
                      </td>
                      <td className="hide-m text-[12px] tabular-nums text-t3">
                        {order.paidAt ? (
                          formatDateTime(order.paidAt)
                        ) : (
                          <span title="尚未支付，按创建时间参与排序">
                            创建 {formatDateTime(order.createdAt)}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-t1"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDetailTarget(order);
                            }}
                          >
                            <MousePointerClick size={11} />
                            详情
                          </button>
                          {order.status === 'paid' && order.bizType === 'vip' ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-brand2"
                              onClick={(event) => {
                                event.stopPropagation();
                                openRefund(order);
                              }}
                            >
                              <RotateCcw size={11} />
                              退款
                            </button>
                          ) : null}
                        </div>
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

      <Modal
        open={refundTarget !== null}
        title={refundDone ? '退款成功' : '订单退款'}
        onClose={closeRefund}
        width={560}
        closable={!refunding && !refundDone}
        footer={
          refundDone ? (
            <button type="button" className="btn btn-red" onClick={closeRefund}>
              完成
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-line"
                onClick={closeRefund}
                disabled={refunding}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-red"
                onClick={submitRefund}
                disabled={refunding}
              >
                {refunding ? '退款处理中…' : '确认退款'}
              </button>
            </>
          )
        }
      >
        {refundDone && refundTarget ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10">
                <CheckCircle2 size={26} className="text-emerald-400" />
              </span>
              <p className="text-[15px] font-bold">退款已完成，会员权益已收回</p>
              <p className="max-w-[420px] text-[12px] leading-relaxed text-t3">
                支付宝退款成功的订单，资金会按原支付渠道退回；模拟支付或管理员赠送订单仅完成本地处理。
              </p>
            </div>
            <div className="rounded-xl border border-line bg-panel2 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] text-t3">订单号</span>
                <span className="mono text-[12px] text-t2">{refundTarget.orderNo}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[12px] text-t3">用户</span>
                <span className="text-[12.5px] text-t1">
                  {refundTarget.user.nickname}
                  <span className="ml-1.5 text-[11.5px] text-t3">
                    {refundTarget.user.email}
                  </span>
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[12px] text-t3">退款金额</span>
                <span className="text-[16px] font-extrabold tabular-nums text-brand2">
                  {formatYuan(refundTarget.amountCents)}
                </span>
              </div>
              <div className="mt-2 flex items-start justify-between gap-3">
                <span className="shrink-0 text-[12px] text-t3">退款原因</span>
                <span className="text-right text-[12.5px] text-t2">{refundDone.reason}</span>
              </div>
            </div>
            <p className="text-center text-[11.5px] text-t3">
              列表与统计数据已同步刷新，退款记录可在「已退款」筛选中查看。
            </p>
          </div>
        ) : refundTarget ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-panel2 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] text-t3">订单号</span>
                <span className="mono text-[12px] text-t2">{refundTarget.orderNo}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[12px] text-t3">用户</span>
                <span className="text-[12.5px] text-t1">
                  {refundTarget.user.nickname}
                  <span className="ml-1.5 text-[11.5px] text-t3">
                    {refundTarget.user.email}
                  </span>
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[12px] text-t3">套餐</span>
                <span className="text-[12.5px] text-t2">
                  {refundTarget.planName ?? '付费会员'}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[12px] text-t3">支付方式 / 时间</span>
                <span className="text-[12.5px] text-t2">
                  {refundTarget.payType === 'alipay' ? '支付宝' : '管理员赠送'} ·{' '}
                  {formatDateTime(refundTarget.paidAt)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
                <span className="text-[12px] text-t3">退款金额</span>
                <span className="text-[17px] font-extrabold tabular-nums text-brand2">
                  {formatYuan(refundTarget.amountCents)}
                </span>
              </div>
            </div>

            <div className="field">
              <label>退款原因</label>
              <select
                value={refundReason}
                onChange={(event) => {
                  setRefundReason(event.target.value as RefundReason);
                  setRefundError('');
                }}
                disabled={refunding}
              >
                {REFUND_REASONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>
                补充说明
                {refundReason === '其他' ? <i>*</i> : null}
              </label>
              <textarea
                value={refundNote}
                maxLength={200}
                onChange={(event) => {
                  setRefundNote(event.target.value);
                  setRefundError('');
                }}
                placeholder="选填，将随退款记录一并保存"
                disabled={refunding}
              />
              <p className="mt-1.5 text-right text-[11px] text-t3">{refundNote.length}/200</p>
            </div>

            <div className="flex gap-2.5 rounded-xl border border-brand/25 bg-brand-dim px-3.5 py-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-brand2" />
              <div className="space-y-1 text-[11.5px] leading-relaxed text-t2">
                <p>
                  真实支付模式下将调用支付宝原路退款；模拟支付或管理员赠送订单仅做本地处理。
                </p>
                <p>退款成功后，该用户的付费会员权益会立即收回，且不可撤销。</p>
                <p>若支付宝退款失败，订单与会员状态保持不变，可稍后重试。</p>
              </div>
            </div>

            {refunding ? (
              <div className="flex items-center gap-2.5 rounded-lg border border-line bg-panel2 px-3 py-2.5 text-[12px] text-t2">
                <Loader2 size={15} className="animate-spin text-brand2" />
                <span>
                  正在提交退款请求
                  {refundTarget.payType === 'alipay' ? '，支付宝退款通常需要几秒钟' : ''}
                  ，请勿关闭窗口…
                </span>
              </div>
            ) : null}

            {refundError ? (
              <div className="rounded-lg border border-brand2/40 bg-brand/10 px-3 py-2.5">
                <p className="text-[12px] leading-relaxed text-[#ff8194]">{refundError}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-t3">
                  订单与会员权益未发生变更，可修改后重新提交。
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={detailTarget !== null}
        title="订单详情"
        onClose={() => setDetailTarget(null)}
        width={620}
      >
        {detailTarget ? (
          <div className="space-y-3 text-[12.5px]">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-line bg-panel2 px-3.5 py-2.5">
                <p className="text-[11px] text-t3">订单号</p>
                <p className="mt-1 mono break-all">{detailTarget.orderNo}</p>
              </div>
              <div className="rounded-lg border border-line bg-panel2 px-3.5 py-2.5">
                <p className="text-[11px] text-t3">状态</p>
                <p className="mt-1">
                  <Badge tone={statusBadge(detailTarget.status).tone}>
                    {statusBadge(detailTarget.status).label}
                  </Badge>
                </p>
              </div>
              <div className="rounded-lg border border-line bg-panel2 px-3.5 py-2.5">
                <p className="text-[11px] text-t3">用户</p>
                <p className="mt-1">{detailTarget.user.nickname}</p>
                <p className="mt-0.5 break-all text-[11.5px] text-t3">
                  {detailTarget.user.email} · ID #{detailTarget.user.id}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-panel2 px-3.5 py-2.5">
                <p className="text-[11px] text-t3">业务 / 内容</p>
                <p className="mt-1">
                  {detailTarget.bizType === 'vip' ? '会员开通' : '积分解锁'}
                </p>
                <p className="mt-0.5 text-[11.5px] text-t3">
                  {detailTarget.bizType === 'vip'
                    ? (detailTarget.planName ?? '付费会员')
                    : (detailTarget.albumTitle ?? '—')}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-panel2 px-3.5 py-2.5">
                <p className="text-[11px] text-t3">金额</p>
                <p className="mt-1 text-[16px] font-extrabold tabular-nums text-brand2">
                  {amountLabel(detailTarget)}
                </p>
                {detailTarget.bizType === 'vip' && detailTarget.vipDays > 0 ? (
                  <p className="mt-0.5 text-[11.5px] text-t3">
                    会员时长 {detailTarget.vipDays} 天
                  </p>
                ) : null}
              </div>
              <div className="rounded-lg border border-line bg-panel2 px-3.5 py-2.5">
                <p className="text-[11px] text-t3">支付方式</p>
                <p className="mt-1">
                  {detailTarget.payType === 'alipay'
                    ? '支付宝'
                    : detailTarget.payType === 'points'
                      ? `积分解锁（${detailTarget.pointsCost} 积分）`
                      : '管理员赠送'}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-panel2 px-3.5 py-2.5">
              <p className="text-[11px] text-t3">时间信息</p>
              <div className="mt-1.5 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[11px] text-t3">创建时间</p>
                  <p className="mt-0.5 tabular-nums">{formatDateTime(detailTarget.createdAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-t3">支付时间</p>
                  <p className="mt-0.5 tabular-nums">{formatDateTime(detailTarget.paidAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-t3">退款时间</p>
                  <p className="mt-0.5 tabular-nums">{formatDateTime(detailTarget.refundAt)}</p>
                </div>
              </div>
            </div>

            {detailTarget.payType === 'alipay' || detailTarget.tradeNo ? (
              <div className="rounded-lg border border-line bg-panel2 px-3.5 py-2.5">
                <p className="text-[11px] text-t3">支付宝交易号</p>
                <p className="mt-1 mono break-all">{detailTarget.tradeNo ?? '—'}</p>
              </div>
            ) : null}

            {detailTarget.status === 'refunded' ? (
              <div className="rounded-lg border border-brand2/40 bg-brand/10 px-3.5 py-2.5">
                <p className="text-[11px] text-brand2">退款原因</p>
                <p className="mt-1 whitespace-pre-wrap wrap-break-word leading-relaxed text-t1">
                  {detailTarget.refundReason ?? '—'}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
