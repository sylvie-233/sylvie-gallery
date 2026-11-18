import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';

import type { AdminConfigBundle } from '@sylvie/types';

import { LoadingRows, PageError, PageHead } from '@/components/ui';
import { adminFetch } from '@/lib/api';
import { useAdminAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import { useToast } from '@/lib/toast';

interface SiteForm {
  copyright: string;
  icpNo: string;
  ageStatement: string;
  disclaimer: string;
  checkinPoints: number;
  watermarkOn: boolean;
}

interface PlanForm {
  price: number;
  days: number;
  benefits: string;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function ConfigPage() {
  const { token, revalidateAll } = useAdminAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const { data, error, isLoading, mutate } = useSWR<AdminConfigBundle>(
    token ? ['/config', token] : null,
    () => adminFetch<AdminConfigBundle>('/config'),
  );

  const [site, setSite] = useState<SiteForm>({
    copyright: '',
    icpNo: '',
    ageStatement: '',
    disclaimer: '',
    checkinPoints: 2,
    watermarkOn: true,
  });
  const [plan, setPlan] = useState<PlanForm>({ price: 19, days: 30, benefits: '' });
  const [siteSaving, setSiteSaving] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [friend, setFriend] = useState({ name: '', slogan: '', url: '' });
  const [friendSaving, setFriendSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setSite({
      copyright: data.site.copyright,
      icpNo: data.site.icpNo,
      ageStatement: data.site.ageStatement,
      disclaimer: data.site.disclaimer,
      checkinPoints: data.site.checkinPoints,
      watermarkOn: data.site.watermarkOn,
    });
    setPlan({
      price: data.plan.priceCents / 100,
      days: data.plan.durationDays,
      benefits: data.plan.benefits.join('\n'),
    });
  }, [data]);

  const saveSite = async () => {
    setSiteSaving(true);
    try {
      await adminFetch('/config/site', {
        method: 'PUT',
        body: site,
      });
      toast('站点配置已保存', 'success');
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '保存失败', 'error');
    } finally {
      setSiteSaving(false);
    }
  };

  const savePlan = async () => {
    if (!plan.price || plan.price <= 0) {
      toast('请输入有效的月卡价格', 'error');
      return;
    }
    if (!plan.days || plan.days < 1) {
      toast('请输入有效的有效天数', 'error');
      return;
    }
    const benefits = plan.benefits
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (benefits.length === 0) {
      toast('请至少填写一条权益文案', 'error');
      return;
    }
    setPlanSaving(true);
    try {
      await adminFetch('/config/plan', {
        method: 'PUT',
        body: {
          priceCents: Math.round(plan.price * 100),
          durationDays: plan.days,
          benefits,
        },
      });
      toast('会员套餐已保存', 'success');
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '保存失败', 'error');
    } finally {
      setPlanSaving(false);
    }
  };

  const addFriend = async () => {
    if (!friend.name.trim() || !friend.url.trim()) {
      toast('请填写站名与链接', 'error');
      return;
    }
    if (!/^https?:\/\//i.test(friend.url.trim())) {
      toast('链接需以 http:// 或 https:// 开头', 'error');
      return;
    }
    setFriendSaving(true);
    try {
      await adminFetch('/config/friends', { method: 'POST', body: friend });
      setFriend({ name: '', slogan: '', url: '' });
      toast('友链已添加', 'success');
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '添加失败', 'error');
    } finally {
      setFriendSaving(false);
    }
  };

  const removeFriend = async (id: number, name: string) => {
    const ok = await confirm({
      title: '删除该友链？',
      text: `${name} 将从前台页脚移除。`,
      okText: '删除',
    });
    if (!ok) return;
    try {
      await adminFetch(`/config/friends/${id}`, { method: 'DELETE' });
      toast('友链已删除', 'success');
      await mutate();
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '删除失败', 'error');
    }
  };

  if (isLoading && !data) {
    return (
      <div className="panel">
        <LoadingRows rows={6} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="panel">
        <PageError message="配置加载失败" onRetry={() => mutate()} />
      </div>
    );
  }

  return (
    <div>
      <PageHead title="友链与配置" sub="页脚友链 + 站点合规文案 + 会员套餐" />

      <div className="grid grid-cols-2 gap-4">
        <div className="panel">
          <div className="p-title">
            站点配置 <span className="n">页脚文案 · 合规声明 · 运营参数</span>
          </div>
          <div className="p-4">
            <div className="field">
              <label>页脚版权文案</label>
              <input
                value={site.copyright}
                onChange={(event) => setSite((value) => ({ ...value, copyright: event.target.value }))}
              />
            </div>
            <div className="field">
              <label>ICP 备案号</label>
              <input
                value={site.icpNo}
                onChange={(event) => setSite((value) => ({ ...value, icpNo: event.target.value }))}
                placeholder="备案后填写"
              />
            </div>
            <div className="field">
              <label>年龄声明</label>
              <input
                value={site.ageStatement}
                onChange={(event) =>
                  setSite((value) => ({ ...value, ageStatement: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>内容免责声明</label>
              <input
                value={site.disclaimer}
                onChange={(event) => setSite((value) => ({ ...value, disclaimer: event.target.value }))}
              />
            </div>
            <div className="frow">
              <div className="field">
                <label>每日签到积分</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={site.checkinPoints}
                  onChange={(event) =>
                    setSite((value) => ({ ...value, checkinPoints: Number(event.target.value) }))
                  }
                />
              </div>
              <div className="field">
                <label>图片水印</label>
                <div className="flex h-[38px] items-center gap-2.5">
                  <button
                    type="button"
                    className={`switch ${site.watermarkOn ? 'on' : ''}`}
                    onClick={() => setSite((value) => ({ ...value, watermarkOn: !value.watermarkOn }))}
                    aria-label="图片水印开关"
                  />
                  <span className="text-[12px] text-t3">
                    {site.watermarkOn ? '未解锁预览带水印' : '预览使用原图'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mb-3 space-y-1 text-[11px] leading-relaxed text-t3">
              <p>· 签到积分为注册会员每日签到可领的分值</p>
              <p>· 水印仅作用于未解锁预览；解锁后与付费会员均为原图</p>
            </div>
            <button type="button" className="btn btn-red w-full" onClick={saveSite} disabled={siteSaving}>
              {siteSaving ? '保存中…' : '保存配置'}
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="p-title">
            会员套餐 <span className="n">对应 membership_plan · v1 仅月卡</span>
          </div>
          <div className="p-4">
            <div className="frow">
              <div className="field">
                <label>月卡价格（元）</label>
                <input
                  type="number"
                  min={1}
                  step={0.01}
                  value={plan.price}
                  onChange={(event) => setPlan((value) => ({ ...value, price: Number(event.target.value) }))}
                />
              </div>
              <div className="field">
                <label>有效天数</label>
                <input
                  type="number"
                  min={1}
                  value={plan.days}
                  onChange={(event) => setPlan((value) => ({ ...value, days: Number(event.target.value) }))}
                />
              </div>
            </div>
            <div className="field">
              <label>权益文案（每行一条）</label>
              <textarea
                value={plan.benefits}
                onChange={(event) => setPlan((value) => ({ ...value, benefits: event.target.value }))}
                style={{ minHeight: 120 }}
              />
            </div>
            <div className="mb-3 space-y-1 text-[11px] leading-relaxed text-t3">
              <p>· 修改价格后前台会员页与详情页解锁区同步展示新价格</p>
              <p>· 已开通会员的有效期不受调价影响；续费按剩余天数叠加</p>
            </div>
            <button type="button" className="btn btn-red w-full" onClick={savePlan} disabled={planSaving}>
              {planSaving ? '保存中…' : '保存套餐'}
            </button>
          </div>
        </div>
      </div>

      <div className="panel mt-4">
        <div className="p-title">
          友情链接 <span className="n">页脚胶囊展示 · 修改后前台实时生效</span>
        </div>
        <div className="p-4">
          {data && data.friendLinks.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5">
              {data.friendLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 rounded-lg border border-line bg-panel2 px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{link.name}</p>
                    <p className="mt-0.5 truncate text-[11.5px] text-t3">{link.slogan ?? '—'}</p>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      title={link.url}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand2 transition hover:text-brand"
                    >
                      {domainOf(link.url)}
                      <ExternalLink size={10} />
                    </a>
                  </div>
                  <button
                    type="button"
                    className="btn-text hover:text-[#ff8194]"
                    onClick={() => removeFriend(link.id, link.name)}
                    aria-label="删除友链"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[12.5px] text-t3">
              暂无友链，页脚不会展示友链胶囊
            </div>
          )}

          <div className="mt-3 grid grid-cols-[1fr_1.4fr_1.4fr_auto] gap-2">
            <input
              value={friend.name}
              onChange={(event) => setFriend((value) => ({ ...value, name: event.target.value }))}
              placeholder="站名，如：片舟"
              maxLength={32}
            />
            <input
              value={friend.slogan}
              onChange={(event) => setFriend((value) => ({ ...value, slogan: event.target.value }))}
              placeholder="一句简介，如：发现好剧 下载好剧"
              maxLength={64}
            />
            <input
              value={friend.url}
              onChange={(event) => setFriend((value) => ({ ...value, url: event.target.value }))}
              placeholder="https://example.com"
            />
            <button
              type="button"
              className="btn btn-line"
              onClick={addFriend}
              disabled={friendSaving}
            >
              <Plus size={14} />
              添加友链
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
