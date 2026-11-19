'use client';

import { useEffect, useState } from 'react';
import { Check, Crown, Sparkles } from 'lucide-react';

import type { MembershipPlanDto, OrderDto } from '@sylvie/types';
import { formatDate, formatPrice } from '@sylvie/utils';

import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import { useBootstrap } from '@/lib/hooks';
import { purchaseVip } from '@/lib/payment';
import { useToast } from '@/lib/toast';

const MEMBER_BENEFITS = [
  '每套图集可预览前 3 张',
  '收藏 / 关注作者 / 参与评论',
  '每日签到领取解锁积分',
  '积分解锁单套图集后永久查看',
  '订阅作者更新提醒',
];

const FALLBACK_PLAN: MembershipPlanDto = {
  id: 0,
  code: 'monthly',
  name: '付费会员 · 月卡',
  priceCents: 1900,
  durationDays: 30,
  benefits: ['全站图集在线畅看', '不限量打包下载无水印原图', '新图提前 3 天看', '专属客服'],
  status: 1,
};

export default function MembershipPage() {
  const { user, openAuth, refreshUser, revalidateAll } = useAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const { data, mutate } = useBootstrap();
  const [pending, setPending] = useState(false);

  const plan = data?.plans[0] ?? FALLBACK_PLAN;
  const benefits = plan.benefits.length > 0 ? plan.benefits : FALLBACK_PLAN.benefits;

  /**
   * 支付宝支付完成回跳：轮询订单状态，确认支付后刷新会员权益。
   * 异步通知通常更快，这里只是兜底，因此轮询 10 次（约 20 秒）。
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderNo = params.get('out_trade_no') ?? params.get('orderNo');
    if (!orderNo) {
      return;
    }

    let cancelled = false;
    let attempts = 0;

    const poll = async (): Promise<void> => {
      if (cancelled) {
        return;
      }
      try {
        const order = await apiFetch<OrderDto>(`/api/orders/${orderNo}/status`);
        if (order.status === 'paid') {
          toast('支付成功，会员权益已生效', 'success');
          await refreshUser();
          await revalidateAll();
          await mutate();
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }
      } catch {
        // 忽略瞬时错误，继续轮询。
      }
      attempts += 1;
      if (attempts < 10) {
        window.setTimeout(() => void poll(), 2000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [toast, refreshUser, revalidateAll, mutate]);

  const handlePaidAction = async () => {
    if (!user) {
      openAuth('login');
      return;
    }
    if (pending) {
      return;
    }
    setPending(true);
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
    setPending(false);
  };

  return (
    <div className="wrap">
      <div className="mb-7 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand-dim px-3 py-1 text-[11.5px] tracking-[2px] text-brand2">
          <Sparkles size={12} />
          会员中心
        </div>
        <h1 className="text-[26px] font-extrabold tracking-tight">选择适合你的会员方式</h1>
        <p className="mx-auto mt-2 max-w-xl text-[13px] leading-relaxed text-t3">
          注册会员可免费预览与积分解锁，付费会员全站畅看并可打包下载原图与视频。会员均不提供上传或发布入口。
        </p>
      </div>

      <div className="mx-auto grid max-w-[880px] gap-4 md:grid-cols-2">
        <section className="relative overflow-hidden rounded-[18px] border border-line bg-panel p-6">
          <p className="text-[11px] tracking-[2px] text-t3">注册会员</p>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <b className="text-[32px] font-extrabold tracking-tight">免费</b>
            <small className="text-[13px] text-t3">邮箱注册即得</small>
          </div>
          <p className="mb-5 mt-1 text-[12.5px] text-t3">先预览，再用积分收藏你喜欢的每一套。</p>
          <ul className="mb-6 space-y-3">
            {MEMBER_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex gap-2.5 text-[13px] leading-relaxed text-t2">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[10px] text-t2">
                  <Check size={10} />
                </span>
                {benefit}
              </li>
            ))}
          </ul>
          {user ? (
            <button type="button" className="btn btn-outline w-full py-3" disabled>
              {user.isVip ? '付费会员已包含注册会员权益' : '当前账号已注册'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-outline w-full py-3"
              onClick={() => openAuth('register')}
            >
              免费注册
            </button>
          )}
        </section>

        <section className="relative overflow-hidden rounded-[18px] border border-brand/40 bg-[radial-gradient(600px_260px_at_100%_0%,rgba(255,45,85,.16),transparent_65%),var(--s1)] p-6">
          <div className="flex items-center gap-2">
            <p className="text-[11px] tracking-[2px] text-brand2">付费会员</p>
            {user?.isVip ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(255,215,119,.14)] px-2 py-0.5 text-[10px] text-[#ffd777]">
                <Crown size={10} fill="currentColor" /> 生效中
              </span>
            ) : null}
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <b className="text-[32px] font-extrabold tracking-tight">{formatPrice(plan.priceCents)}</b>
            <small className="text-[13px] text-t3">/ {plan.durationDays} 天</small>
          </div>
          <p className="mb-5 mt-1 text-[12.5px] text-t3">按月计费，续费在剩余有效期上叠加，不清零。</p>
          <ul className="mb-6 space-y-3">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex gap-2.5 text-[13px] leading-relaxed text-t2">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-dim text-[10px] text-brand2">
                  <Check size={10} />
                </span>
                {benefit}
              </li>
            ))}
          </ul>
          {user?.isVip && user.vipExpireAt ? (
            <p className="mb-3 text-center text-[11.5px] text-t3">
              当前有效期至 {formatDate(user.vipExpireAt)}
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-brand w-full py-3"
            onClick={handlePaidAction}
            disabled={pending}
          >
            <Crown size={16} />
            {pending ? '正在处理…' : user?.isVip ? `续费 ${plan.durationDays} 天` : '立即开通（支付宝）'}
          </button>
          <p className="mt-3 text-center text-[11px] text-t3">
            仅支持支付宝 · 虚拟内容不支持退款（后台可人工处理）
          </p>
        </section>
      </div>

      <div className="mx-auto mt-8 max-w-[880px] space-y-2 text-center text-[12px] leading-relaxed text-t3">
        <p>付费会员全站图集在线畅看，可打包下载无水印原图；积分解锁的图集也可重复下载。</p>
        <p>所有图集仅由管理员统一发布与审核，注册会员与付费会员均无上传 / 发布权限。</p>
      </div>
    </div>
  );
}
