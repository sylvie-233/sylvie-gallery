'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Crown, Eye, Receipt, Sparkles } from 'lucide-react';

import type { PurchaseData } from '@sylvie/types';
import { formatDateTime, formatPrice } from '@sylvie/utils';
import { CoverImage, EmptyState, Pagination, PurchaseSkeleton } from '@sylvie/ui/web';

import { AuthGate } from '@/components/auth-gate';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import { useBootstrap } from '@/lib/hooks';
import { purchaseVip } from '@/lib/payment';
import { useToast } from '@/lib/toast';

function PurchasesContent() {
  const { user, token, refreshUser, revalidateAll } = useAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const { data: bootstrap } = useBootstrap();
  const [ordersPage, setOrdersPage] = useState(1);
  const [unlocksPage, setUnlocksPage] = useState(1);
  const [renewing, setRenewing] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<PurchaseData>(
    [`/orders/mine`, token, ordersPage, unlocksPage],
    () =>
      apiFetch<PurchaseData>(
        `/api/orders/mine?ordersPage=${ordersPage}&unlocksPage=${unlocksPage}&pageSize=6`,
      ),
  );

  const plan = bootstrap?.plans[0];

  const renew = async () => {
    if (!plan || renewing) {
      return;
    }
    setRenewing(true);
    const success = await purchaseVip({
      plan,
      confirm,
      toast,
      refreshUser,
      revalidateAll,
    });
    if (success) {
      await mutate();
    }
    setRenewing(false);
  };

  return (
    <div className="wrap">
      <div className="mb-4">
        <h1 className="page-title">我的购买</h1>
        <p className="mt-1.5 text-[13px] text-t3">会员订单与积分解锁记录</p>
      </div>

      {isLoading && !data ? (
        <PurchaseSkeleton />
      ) : error && !data ? (
        <div className="panel px-6 py-14 text-center">
          <p className="text-t2">购买记录加载失败</p>
          <button type="button" className="btn btn-outline mt-4" onClick={() => mutate()}>
            重新加载
          </button>
        </div>
      ) : data ? (
        <>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="panel px-4 py-3.5">
              <b className="block text-[20px] font-extrabold tabular-nums">
                {formatPrice(data.overview.totalSpentCents)}
              </b>
              <span className="mt-1 block text-[11.5px] text-t3">累计消费</span>
            </div>
            <div className="panel px-4 py-3.5">
              <b className="block text-[20px] font-extrabold tabular-nums">
                {data.overview.vipOrderCount}
              </b>
              <span className="mt-1 block text-[11.5px] text-t3">会员订单数</span>
            </div>
            <div className="panel px-4 py-3.5">
              <b className="block text-[20px] font-extrabold tabular-nums">
                {data.overview.unlockedCount}
              </b>
              <span className="mt-1 block text-[11.5px] text-t3">已解锁图集数</span>
            </div>
          </div>

          {data.ordersTotal > 0 ? (
            <section className="mb-6">
              <div className="mb-2.5 flex items-center gap-2">
                <h2 className="section-title">会员订单</h2>
                <span className="text-xs tabular-nums text-t3">
                  共 {data.ordersTotal} 单 · 第 {data.ordersPage} / {data.ordersTotalPages} 页
                </span>
              </div>
              <div className="space-y-2.5">
                {data.orders.map((order) => (
                  <div
                    key={order.id}
                    className="panel flex flex-wrap items-center gap-3 p-3.5 transition hover:border-line2 sm:flex-nowrap"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[rgba(255,215,119,.18)] bg-[linear-gradient(135deg,rgba(255,215,119,.2),rgba(224,165,58,.08))] text-[#ffd777]">
                      <Crown size={18} fill="currentColor" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold">
                        {order.planName ?? '付费会员'}
                      </p>
                      <p className="mt-1 truncate text-[11.5px] text-t3">
                        订单号 {order.orderNo} · {order.paidAt ? formatDateTime(order.paidAt) : '—'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[13.5px] font-bold text-brand2 tabular-nums">
                        {formatPrice(order.amountCents)}
                      </span>
                      <span className="text-[11px] text-t3">
                        {user?.isVip ? '生效中' : '已到期'} · {order.vipDays} 天
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={renew}
                      disabled={renewing}
                    >
                      {renewing ? '处理中…' : '续费'}
                    </button>
                  </div>
                ))}
              </div>
              <Pagination
                page={data.ordersPage}
                totalPages={data.ordersTotalPages}
                onChange={(nextPage) => {
                  setOrdersPage(nextPage);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </section>
          ) : null}

          {data.unlocksTotal > 0 ? (
            <section>
              <div className="mb-2.5 flex items-center gap-2">
                <h2 className="section-title">图集解锁</h2>
                <span className="text-xs tabular-nums text-t3">
                  共 {data.unlocksTotal} 条 · 第 {data.unlocksPage} / {data.unlocksTotalPages} 页
                </span>
              </div>
              <div className="space-y-2.5">
                {data.unlocks.map((unlock) => (
                  <div
                    key={unlock.id}
                    className="panel flex items-center gap-3 p-3 transition hover:border-line2"
                  >
                    <div className="h-14 w-11 shrink-0 overflow-hidden rounded-lg border border-line">
                      <CoverImage src={unlock.album.coverUrl} alt={unlock.album.title} fallback="希" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-[#e8e8ec]">
                        {unlock.album.title}
                      </p>
                      <p className="mt-1 truncate text-[11.5px] text-t3">
                        {unlock.album.imageCount}P
                        {unlock.album.videoCount > 0 ? ` · ${unlock.album.videoCount}V` : ''} ·{' '}
                        {unlock.album.packageSize} MB · {unlock.album.author.name}
                      </p>
                      <p className="mt-1 text-[11.5px] text-t3">
                        消耗 {unlock.pointsCost} 积分 · {formatDateTime(unlock.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10.5px] text-emerald-400">
                        已解锁
                      </span>
                      <Link
                        href={`/albums/${unlock.album.id}`}
                        className="inline-flex items-center gap-1 text-[11.5px] text-brand2 transition hover:text-brand"
                      >
                        <Eye size={12} />
                        查看
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
              <Pagination
                page={data.unlocksPage}
                totalPages={data.unlocksTotalPages}
                onChange={(nextPage) => {
                  setUnlocksPage(nextPage);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </section>
          ) : null}

          {data.ordersTotal === 0 && data.unlocksTotal === 0 ? (
            <div className="panel">
              <EmptyState
                icon={<Receipt size={22} />}
                title="还没有购买记录"
                text="开通付费会员可全站畅看与下载，或用签到积分解锁单套图集。"
                action={
                  <Link href="/membership" className="btn btn-brand">
                    <Sparkles size={14} />
                    去看看会员
                  </Link>
                }
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function PurchasesPage() {
  return (
    <AuthGate>
      <PurchasesContent />
    </AuthGate>
  );
}
