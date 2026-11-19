import { useState } from 'react';
import useSWR from 'swr';
import { Copy, KeyRound, Plus, ShieldOff } from 'lucide-react';

import type { AdminAgentTokenCreateResult, AdminAgentTokenRow } from '@sylvie/types';

import {
  Badge,
  Empty,
  LoadingRows,
  Modal,
  PageError,
  PageHead,
  Tabs,
} from '@/components/ui';
import { adminFetch } from '@/lib/api';
import { useAdminAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import { formatDate } from '@/lib/date';
import { useToast } from '@/lib/toast';

type Scope = 'read' | 'write';
type Expiry = 'permanent' | '7' | '30' | '90';

const SCOPE_TABS: Array<{ value: Scope; label: string }> = [
  { value: 'read', label: '只读' },
  { value: 'write', label: '读写' },
];

const EXPIRY_OPTIONS: Array<{ value: Expiry; label: string }> = [
  { value: 'permanent', label: '永久有效' },
  { value: '7', label: '7 天' },
  { value: '30', label: '30 天' },
  { value: '90', label: '90 天' },
];

function isExpired(token: AdminAgentTokenRow): boolean {
  if (!token.expiresAt) return false;
  return Date.parse(token.expiresAt.replace(' ', 'T')) < Date.now();
}

function tokenState(token: AdminAgentTokenRow): { tone: 'green' | 'red' | 'gray'; label: string } {
  if (token.status === 0) return { tone: 'gray', label: '已吊销' };
  if (isExpired(token)) return { tone: 'red', label: '已过期' };
  return { tone: 'green', label: '启用中' };
}

function dateText(value: string | null): string {
  return value ? formatDate(value) : '—';
}

export function AgentTokensPage() {
  const { token: adminToken } = useAdminAuth();
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<Scope>('read');
  const [expiry, setExpiry] = useState<Expiry>('30');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<AdminAgentTokenCreateResult | null>(null);

  const { data, error, isLoading, mutate } = useSWR<AdminAgentTokenRow[]>(
    adminToken ? ['/agent-tokens', adminToken] : null,
    () => adminFetch<AdminAgentTokenRow[]>('/agent-tokens'),
    { revalidateOnFocus: false },
  );

  const openCreate = () => {
    setName('');
    setScope('read');
    setExpiry('30');
    setCreateOpen(true);
  };

  const submit = async () => {
    if (!name.trim()) {
      toast('请输入令牌名称', 'error');
      return;
    }
    setSaving(true);
    try {
      const result = await adminFetch<AdminAgentTokenCreateResult>('/agent-tokens', {
        method: 'POST',
        body: {
          name: name.trim(),
          scope,
          expiresInDays: expiry === 'permanent' ? null : Number(expiry),
        },
      });
      setCreateOpen(false);
      setCreated(result);
      toast('令牌已创建，请立即复制保存', 'success');
      await mutate();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '创建失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (item: AdminAgentTokenRow) => {
    const ok = await confirm({
      title: `吊销「${item.name}」？`,
      text: '吊销后该令牌立即失效，使用它的 agent 将无法继续连接 MCP。该操作不可恢复。',
      okText: '吊销令牌',
    });
    if (!ok) return;
    try {
      await adminFetch(`/agent-tokens/${item.id}/revoke`, { method: 'POST' });
      toast('令牌已吊销', 'success');
      await mutate();
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '吊销失败', 'error');
    }
  };

  const copyToken = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.token);
      toast('令牌已复制到剪贴板', 'success');
    } catch {
      toast('复制失败，请手动选择令牌文本', 'error');
    }
  };

  return (
    <div>
      <PageHead
        title="Agent 令牌"
        sub="供 WorkBuddy 等 agent 工具连接 MCP 的独立访问令牌 · 明文仅创建时展示一次"
      >
        <button type="button" className="btn btn-red" onClick={openCreate}>
          <Plus size={15} />
          新建令牌
        </button>
      </PageHead>

      <div className="panel">
        {isLoading && !data ? (
          <LoadingRows rows={5} />
        ) : error && !data ? (
          <PageError message="令牌列表加载失败" onRetry={() => mutate()} />
        ) : data && data.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>令牌前缀</th>
                <th>权限</th>
                <th>状态</th>
                <th className="hide-m">最近使用</th>
                <th className="hide-m">有效期</th>
                <th>创建人</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => {
                const state = tokenState(item);
                return (
                  <tr key={item.id}>
                    <td className="text-[13px] text-t1">
                      <div className="flex items-center gap-2">
                        <KeyRound size={14} className="text-brand2" />
                        {item.name}
                      </div>
                    </td>
                    <td className="mono text-[12px] text-t3">{item.tokenPrefix}</td>
                    <td>
                      {item.scope === 'write' ? (
                        <Badge tone="brand">读写</Badge>
                      ) : (
                        <Badge tone="blue">只读</Badge>
                      )}
                    </td>
                    <td>
                      <Badge tone={state.tone}>{state.label}</Badge>
                    </td>
                    <td className="hide-m text-[12px] tabular-nums text-t3">
                      {item.lastUsedAt ? formatDate(item.lastUsedAt) : '从未使用'}
                    </td>
                    <td className="hide-m text-[12px] tabular-nums text-t3">
                      {item.expiresAt ? dateText(item.expiresAt) : '永久'}
                    </td>
                    <td className="text-[12px] text-t3">{item.adminName}</td>
                    <td>
                      {item.status === 1 ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] text-t3 transition hover:bg-white/5 hover:text-[#ff8194]"
                          onClick={() => revoke(item)}
                        >
                          <ShieldOff size={11} />
                          吊销
                        </button>
                      ) : (
                        <span className="text-[11.5px] text-t3">已失效</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <Empty
            title="还没有 Agent 令牌"
            text="创建只读或读写令牌后，在 WorkBuddy 等工具中配置 MCP 端点与请求头即可连接。"
          />
        )}
      </div>

      <Modal
        open={createOpen}
        title="新建 Agent 令牌"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn-line" onClick={() => setCreateOpen(false)}>
              取消
            </button>
            <button type="button" className="btn btn-red" onClick={submit} disabled={saving}>
              {saving ? '创建中…' : '创建令牌'}
            </button>
          </>
        }
      >
        <div className="field">
          <label>
            令牌名称 <i>*</i>
          </label>
          <input
            value={name}
            maxLength={32}
            onChange={(event) => setName(event.target.value)}
            placeholder="如：WorkBuddy 只读、CI 发布"
            autoFocus
          />
        </div>

        <div className="field">
          <label>权限范围</label>
          <Tabs items={SCOPE_TABS} value={scope} onChange={setScope} />
          <p className="mt-2 text-[11.5px] text-t3">
            只读令牌仅能调用查询工具；读写令牌可执行上下架、审核、积分调整等管理操作。
          </p>
        </div>

        <div className="field">
          <label>有效期</label>
          <select value={expiry} onChange={(event) => setExpiry(event.target.value as Expiry)}>
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </Modal>

      <Modal
        open={created !== null}
        title="令牌已创建"
        onClose={() => setCreated(null)}
        footer={
          <button type="button" className="btn btn-red" onClick={() => setCreated(null)}>
            我已保存
          </button>
        }
        width={620}
      >
        {created ? (
          <>
            <div className="field">
              <label>
                明文令牌 <i>*</i>
              </label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={created.token}
                  className="mono text-[12.5px]"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button type="button" className="btn btn-line shrink-0" onClick={copyToken}>
                  <Copy size={14} />
                  复制
                </button>
              </div>
            </div>
            <p className="text-[12px] leading-relaxed text-t3">
              请立即复制保存。关闭后令牌明文不会再次展示，也无法从数据库中恢复。
              <br />
              名称：{created.item.name} · 权限：{created.item.scope === 'write' ? '读写' : '只读'} ·
              有效期：{created.item.expiresAt ? formatDate(created.item.expiresAt) : '永久'}
            </p>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
