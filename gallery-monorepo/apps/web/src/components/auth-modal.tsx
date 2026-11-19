'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Logo } from '@sylvie/ui/web';
import { useBodyScrollLock, useNavigationKeys } from '@sylvie/ui';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthModal() {
  const { authOpen, authMode, setAuthMode, closeAuth, login, register } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!authOpen) {
      return;
    }
    setError('');
  }, [authOpen, authMode]);

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  useBodyScrollLock(authOpen);
  useNavigationKeys({ onEscape: closeAuth }, authOpen);

  if (!authOpen) {
    return null;
  }

  const sendCode = async () => {
    if (!EMAIL_PATTERN.test(email.trim())) {
      toast('请先填写正确的邮箱', 'error');
      return;
    }
    if (sending || countdown > 0) {
      return;
    }
    setSending(true);
    try {
      const result = await apiFetch<{ sent: boolean; demoCode?: string }>('/api/auth/send-code', {
        method: 'POST',
        body: { email: email.trim(), scene: 'register' },
      });
      setCountdown(60);
      toast(result.demoCode ? `验证码已发送，演示码：${result.demoCode}` : '验证码已发送', 'success');
    } catch (requestError) {
      toast(requestError instanceof Error ? requestError.message : '发送失败', 'error');
    } finally {
      setSending(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError('请输入正确的邮箱地址');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }

    setSubmitting(true);
    try {
      if (authMode === 'login') {
        await login(trimmedEmail, password);
        toast('登录成功', 'success');
      } else {
        const nameLength = Array.from(nickname.trim()).length;
        if (nameLength < 1 || nameLength > 16) {
          setError('昵称需为 1-16 个字符');
          setSubmitting(false);
          return;
        }
        if (!code.trim()) {
          setError('请先获取并填写邮箱验证码');
          setSubmitting(false);
          return;
        }
        await register({
          nickname: nickname.trim(),
          email: trimmedEmail,
          password,
          code: code.trim(),
        });
        toast('注册成功，已自动登录', 'success');
        setPassword('');
        setCode('');
      }
      setEmail('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '操作失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-mask" onClick={closeAuth} role="presentation">
      <div
        className="modal-card max-w-[430px]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={authMode === 'login' ? '登录' : '注册'}
      >
        <div className="relative rounded-t-2xl border-b border-line bg-[radial-gradient(420px_180px_at_50%_-40px,rgba(255,45,85,.24),transparent_70%)] px-6 pb-5 pt-6">
          <button
            type="button"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-t3 transition hover:bg-white/5 hover:text-t1"
            onClick={closeAuth}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
          <div className="flex flex-col items-center gap-3">
            <Logo size={44} withText={false} href="" />
            <div className="text-center">
              <p className="text-[18px] font-extrabold tracking-wide">希尔薇图集</p>
              <p className="mt-1 text-xs tracking-[2px] text-t3">高清写真 · 每日更新</p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 pt-5">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-line bg-panel p-1">
            <button
              type="button"
              className={`rounded-lg py-2 text-[13px] transition ${
                authMode === 'login' ? 'bg-brand-dim font-semibold text-brand2' : 'text-t2 hover:text-t1'
              }`}
              onClick={() => setAuthMode('login')}
            >
              登录
            </button>
            <button
              type="button"
              className={`rounded-lg py-2 text-[13px] transition ${
                authMode === 'register'
                  ? 'bg-brand-dim font-semibold text-brand2'
                  : 'text-t2 hover:text-t1'
              }`}
              onClick={() => setAuthMode('register')}
            >
              注册
            </button>
          </div>

          <form className="space-y-3.5" onSubmit={submit}>
            {authMode === 'register' ? (
              <label className="block">
                <span className="mb-1.5 block text-xs text-t3">昵称</span>
                <input
                  className="input"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="1-16 个字符"
                  maxLength={16}
                />
              </label>
            ) : null}

            <label className="block">
              <span className="mb-1.5 block text-xs text-t3">邮箱</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>

            {authMode === 'register' ? (
              <label className="block">
                <span className="mb-1.5 block text-xs text-t3">邮箱验证码</span>
                <span className="flex gap-2">
                  <input
                    className="input"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="6 位验证码"
                    maxLength={8}
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    className="btn btn-outline shrink-0"
                    onClick={sendCode}
                    disabled={sending || countdown > 0}
                  >
                    {countdown > 0 ? `重新获取(${countdown}s)` : sending ? '发送中…' : '获取验证码'}
                  </button>
                </span>
              </label>
            ) : null}

            <label className="block">
              <span className="mb-1.5 block text-xs text-t3">密码</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={authMode === 'register' ? '至少 6 位' : '请输入密码'}
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>

            {error ? <p className="text-xs leading-relaxed text-brand2">{error}</p> : null}

            <button type="submit" className="btn btn-brand mt-1 w-full py-3" disabled={submitting}>
              {submitting ? '请稍候…' : authMode === 'login' ? '登录' : '注册并登录'}
            </button>
          </form>

          <p className="mt-4 text-center text-[11.5px] leading-relaxed text-t3">
            演示账号：demo@sylvie.cc / 123456
            <br />
            注册验证码在开发环境固定为 123456
          </p>
        </div>
      </div>
    </div>
  );
}
