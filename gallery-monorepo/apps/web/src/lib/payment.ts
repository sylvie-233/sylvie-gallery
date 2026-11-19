'use client';

import type { MembershipPlanDto, OrderDto, VipOrderResult } from '@sylvie/types';
import { formatPrice } from '@sylvie/utils';

import { apiFetch } from './api';

interface PurchaseVipOptions {
  plan: MembershipPlanDto;
  confirm: (options: {
    title: string;
    text?: string;
    okText?: string;
    cancelText?: string;
  }) => Promise<boolean>;
  toast: (message: string, type?: 'success' | 'error' | 'info') => void;
  refreshUser: () => Promise<unknown>;
  revalidateAll: () => Promise<void>;
}

/**
 * 会员开通 / 续费流程：
 * 确认订单 → 创建支付宝订单 → 模拟支付（ALIPAY_MOCK）→ 刷新登录态与页面数据。
 */
export async function purchaseVip({
  plan,
  confirm,
  toast,
  refreshUser,
  revalidateAll,
}: PurchaseVipOptions): Promise<boolean> {
  const ok = await confirm({
    title: '确认开通付费会员？',
    text: `套餐：${plan.name}\n金额：${formatPrice(plan.priceCents)} · 有效期 ${plan.durationDays} 天\n支付方式：支付宝`,
    okText: '立即支付',
  });
  if (!ok) {
    return false;
  }

  try {
    const result = await apiFetch<VipOrderResult>('/api/orders/vip', {
      method: 'POST',
      body: { planCode: plan.code },
    });

    if (!result.payment.mock) {
      if (!result.payment.payUrl) {
        toast('支付渠道暂不可用，请稍后再试', 'error');
        return false;
      }
      toast('正在跳转支付宝收银台…', 'info');
      window.location.assign(result.payment.payUrl);
      return true;
    }

    const order = await apiFetch<OrderDto>(`/api/orders/${result.order.orderNo}/pay`, {
      method: 'POST',
    });
    toast(
      order.status === 'paid' ? '支付成功，会员权益已生效' : '订单已创建，请完成支付',
      'success',
    );
    await refreshUser();
    await revalidateAll();
    return true;
  } catch (error) {
    toast(error instanceof Error ? error.message : '支付失败，请稍后重试', 'error');
    return false;
  }
}
