import { useState } from 'react';
import useSWR from 'swr';
import { Ban, Copy, Crown, KeyRound, PlusCircle, ShieldCheck } from 'lucide-react';

import type {
  AdminResetPasswordResult,
  AdminUserPage,
  AdminUserRow,
  Role,
} from '@sylvie/types';

import {
  AvatarBox,
  Badge,
  Empty,
  LoadingRows,
  Modal,
  PageError,
  PageHead,
  Pagination,
  SearchBox,
} from '@/components/ui';
import { adminFetch } from '@/lib/api';
import { useAdminAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import { formatDate } from '@/lib/date';
import { useToast } from '@/lib/toast';

const ROLE_BADGE: Record<Role, { tone: 'blue' | 'amber' | 'gray'; label: string }> = {
  admin: { tone: 'blue', label: '管理员' },
  vip: { tone: 'amber', label: '付费会员' },
  member: { tone: 'gray', label: '注册会员' },
};

const REASONS = ['活动奖励', '运营补偿', '违规扣除', '其他'];

export function UsersPage() {
  const { token, revalidateAll } = useAdminAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const [role, setRole] = useState<'all' | Role>('all');
  const [status, setStatus] = useState<'all' | '1' | '0'>('all');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);

  const [pointsUser, setPointsUser] = useState<AdminUserRow | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('活动奖励');
  const [customReason, setCustomReason] = useState('');
  const [savingPoints, setSavingPoints] = useState(false);

  const [passwordResult, setPasswordResult] = useState<AdminResetPasswordResult | null>(null);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', '8');
  if (role !== 'all') params.set('role', role);
  if (status !== 'all') params.set('status', status);
  if (keyword) params.set('keyword', keyword);

  const { data, error, isLoading, mutate } = useSWR<AdminUserPage>(
    token ? [`/users?${params.toString()}`, token] : null,
    () => adminFetch<AdminUserPage>(`/users?${params.toString()}`),
  );

  const resetPage = () => setPage(1);

  const afterAction = async (message: string) => {
    toast(message, 'success');
    await mutate();
    void revalidateAll();
  };

  const openPoints = (user: AdminUserRow) => {
    setPointsUser(user);
    setDelta('');
    setReason('活动奖励');
    setCustomReason('');
  };

  const submitPoints = async () => {
    if (!pointsUser) return;
    const value = Number(delta);
    if (!Number.isInteger(value) || value === 0) {
      toast('请输入非 0 的整数变动值', 'error');
      return;
    }
    const finalReason = reason === '其他' ? customReason.trim() : reason;
    if (!finalReason) {
      toast('请填写调整原因', 'error');
      return;
    }
    setSavingPoints(true);
    try {
      await adminFetch(`/users/${pointsUser.id}/points`, {
        method: 'POST',
        body: { delta: value, reason: finalReason },
      });
      setPointsUser(null);
      await afterAction('积分已调整');
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '调整失败', 'error');
    } finally {
      setSavingPoints(false);
    }
  };

  const grantVip = async (user: AdminUserRow) => {
    const ok = await confirm({
      title: '赠送付费会员？',
      text: `将为 ${user.nickname}（${user.email}）赠送 30 天付费会员，已有有效期上叠加。`,
      okText: '赠送',
    });
    if (!ok) return;
    try {
      await adminFetch(`/users/${user.id}/grant-vip`, { method: 'POST' });
      await afterAction('已赠送 30 天付费会员');
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '赠送失败', 'error');
    }
  };

  const resetPassword = async (user: AdminUserRow) => {
    const ok = await confirm({
      title: '重置该用户密码？',
      text: `将生成临时密码并立即失效原密码：${user.nickname}（${user.email}）。临时密码仅本次展示。`,
      okText: '重置密码',
    });
    if (!ok) return;
    try {
      const result = await adminFetch<AdminResetPasswordResult>(
        `/users/${user.id}/reset-password`,
        { method: 'POST' },
      );
      setPasswordResult(result);
      void revalidateAll();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '重置失败', 'error');
    }
  };

  const toggleStatus = async (user: AdminUserRow) => {
    const banning = user.status === 1;
    const ok = await confirm({
      title: banning ? '封禁该用户？' : '解除封禁？',
      text: banning
        ? `${user.nickname} 将无法登录前台，已登录会话会在下次请求时失效。`
        : `${user.nickname} 将恢复账号正常使用。`,
      okText: banning ? '封禁' : '解封',
    });
    if (!ok) return;
    try {
      await adminFetch(`/users/${user.id}/toggle-status`, { method: 'POST' });
      await afterAction(banning ? '用户已封禁' : '用户已解封');
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '操作失败', 'error');
    }
  };

  const copyPassword = async () => {
    if (!passwordResult) return;
    try {
      await navigator.clipboard.writeText(passwordResult.password);
      toast('临时密码已复制', 'success');
    } catch {
      toast('复制失败，请手动选择复制', 'error');
    }
  };

  return (
    <div>
      <PageHead
        title="用户管理"
        sub={
          data
            ? `匹配 ${data.total} 位 · 共 ${data.totalAll} 位 · 第 ${data.page} / ${data.totalPages} 页`
            : ''
        }
      />

      <div className="panel">
        <div className="toolbar">
          <div className="seg">
            <select
              value={role}
              onChange={(event) => {
                setRole(event.target.value as 'all' | Role);
                resetPage();
              }}
            >
              <option value="all">全部角色</option>
              <option value="admin">管理员</option>
              <option value="vip">付费会员</option>
              <option value="member">注册会员</option>
            </select>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as 'all' | '1' | '0');
                resetPage();
              }}
            >
              <option value="all">全部状态</option>
              <option value="1">正常</option>
              <option value="0">已封禁</option>
            </select>
          </div>
          <div className="sp" />
          <SearchBox
            value={keywordInput}
            onChange={setKeywordInput}
            onSearch={() => {
              setKeyword(keywordInput.trim());
              resetPage();
            }}
            placeholder="搜索昵称 / 邮箱"
          />
        </div>

        {isLoading && !data ? (
          <LoadingRows />
        ) : error && !data ? (
          <PageError message="用户列表加载失败" onRetry={() => mutate()} />
        ) : data && data.list.length > 0 ? (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>角色</th>
                  <th className="hide-m">解锁积分</th>
                  <th className="hide-m">会员到期</th>
                  <th className="hide-m">注册时间</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.list.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <AvatarBox
                          name={user.nickname}
                          initial={user.nickname.slice(0, 1)}
                          color={user.role === 'vip' ? '#e0a53a' : '#8e7cff'}
                          size={32}
                          rounded={16}
                        />
                        <div>
                          <p className="text-[13px]">{user.nickname}</p>
                          <p className="mt-0.5 text-[11px] text-t3">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge tone={ROLE_BADGE[user.role].tone}>{ROLE_BADGE[user.role].label}</Badge>
                    </td>
                    <td className="hide-m text-[12.5px] tabular-nums text-t2">{user.points} 分</td>
                    <td className="hide-m text-[12px] tabular-nums text-t3">
                      {user.vipExpireAt ? formatDate(user.vipExpireAt) : '—'}
                    </td>
                    <td className="hide-m text-[12px] tabular-nums text-t3">
                      {formatDate(user.createdAt)}
                    </td>
                    <td>
                      {user.status === 1 ? (
                        <Badge tone="green">正常</Badge>
                      ) : (
                        <Badge tone="red">已封禁</Badge>
                      )}
                    </td>
                    <td>
                      {user.role === 'admin' ? (
                        <span className="text-[11.5px] text-t3">—</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-brand2"
                            onClick={() => openPoints(user)}
                          >
                            <PlusCircle size={11} />
                            调积分
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-[#ffd777]"
                            onClick={() => grantVip(user)}
                          >
                            <Crown size={11} />
                            赠会员
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-t1"
                            onClick={() => resetPassword(user)}
                          >
                            <KeyRound size={11} />
                            重置密码
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-[#ff8194]"
                            onClick={() => toggleStatus(user)}
                          >
                            {user.status === 1 ? <Ban size={11} /> : <ShieldCheck size={11} />}
                            {user.status === 1 ? '封禁' : '解封'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </>
        ) : (
          <Empty title="没有符合条件的用户" text="换个角色、状态或关键词试试。" />
        )}
      </div>

      <Modal
        open={pointsUser !== null}
        title="调整解锁积分"
        onClose={() => setPointsUser(null)}
        footer={
          <>
            <button type="button" className="btn btn-line" onClick={() => setPointsUser(null)}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-red"
              onClick={submitPoints}
              disabled={savingPoints}
            >
              {savingPoints ? '提交中…' : '确认调整'}
            </button>
          </>
        }
      >
        {pointsUser ? (
          <div>
            <div className="mb-4 rounded-lg border border-line bg-panel2 px-3.5 py-3 text-[12.5px]">
              <p>
                {pointsUser.nickname} <span className="text-t3">({pointsUser.email})</span>
              </p>
              <p className="mt-1 text-t3">
                当前解锁积分：<b className="text-t1">{pointsUser.points} 分</b>
              </p>
            </div>
            <div className="field">
              <label>
                变动值 <i>*</i>
              </label>
              <input
                type="number"
                value={delta}
                onChange={(event) => setDelta(event.target.value)}
                placeholder="正数发放、负数扣减，如 +10 / -5"
              />
              <p className="mt-1.5 text-[11px] text-t3">扣减超出余额时按 0 处理。</p>
            </div>
            <div className="field">
              <label>调整原因</label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {REASONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`rounded-full border px-2.5 py-1 text-[11.5px] transition ${
                      reason === item
                        ? 'border-brand/40 bg-brand-dim text-brand2'
                        : 'border-line text-t3 hover:text-t1'
                    }`}
                    onClick={() => setReason(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              {reason === '其他' ? (
                <input
                  value={customReason}
                  onChange={(event) => setCustomReason(event.target.value)}
                  placeholder="填写调整原因"
                  maxLength={64}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={passwordResult !== null}
        title="临时密码"
        onClose={() => setPasswordResult(null)}
        footer={
          <>
            <button type="button" className="btn btn-line" onClick={() => setPasswordResult(null)}>
              关闭
            </button>
            <button type="button" className="btn btn-red" onClick={copyPassword}>
              <Copy size={13} />
              复制密码
            </button>
          </>
        }
      >
        {passwordResult ? (
          <div>
            <p className="text-[12.5px] text-t2">
              {passwordResult.user.nickname}{' '}
              <span className="text-t3">({passwordResult.user.email})</span>
            </p>
            <div className="my-4 rounded-lg border border-brand/30 bg-brand-dim px-4 py-4 text-center">
              <code className="text-[24px] font-bold tracking-[2px] text-brand2">
                {passwordResult.password}
              </code>
            </div>
            <div className="space-y-1 text-[11.5px] leading-relaxed text-t3">
              <p>· 该密码仅本次展示，关闭弹窗后无法再次查看</p>
              <p>· 原密码已立即失效，请尽快通知用户登录后修改</p>
            </div>
          </div>
        ) : null}
      </Modal>

    </div>
  );
}
