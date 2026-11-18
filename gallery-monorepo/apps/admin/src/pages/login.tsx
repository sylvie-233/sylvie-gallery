import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';

import { useAdminAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, user, initialized } = useAdminAuth();
  const { toast } = useToast();
  const passwordRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (initialized && user) {
      navigate('/', { replace: true });
    }
  }, [initialized, user, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('请输入账号与密码');
      setShake(true);
      window.setTimeout(() => setShake(false), 320);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const profile = await login(email.trim(), password, remember);
      toast(`欢迎回来，${profile.nickname}`, 'success');
      navigate('/', { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '账号或密码不正确，请重试');
      setShake(true);
      window.setTimeout(() => setShake(false), 320);
      passwordRef.current?.focus();
      passwordRef.current?.select();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <form
        className={`login-card ${shake ? 'shake' : ''}`}
        onSubmit={submit}
        autoComplete="off"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#ff2d55,#ff4b6b)] text-[20px] font-bold text-white shadow-[0_8px_24px_rgba(255,45,85,.35)]">
            希
          </span>
          <span>
            <b className="block text-[17px]">希尔薇图集</b>
            <span className="mt-0.5 block text-[11.5px] text-t3">管理后台 · v1</span>
          </span>
        </div>
        <p className="mb-5 mt-3 text-[12.5px] text-t3">仅限管理员登录，账号由数据库统一维护。</p>

        <div className="field">
          <label>账号 / 邮箱</label>
          <input
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError('');
            }}
            placeholder="admin@sylvie.cc"
            autoFocus
            autoComplete="username"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                passwordRef.current?.focus();
              }
            }}
          />
        </div>

        <div className="field">
          <label>密码</label>
          <input
            ref={passwordRef}
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError('');
            }}
            placeholder="请输入密码"
            autoComplete="current-password"
          />
        </div>

        {error ? <p className="mb-2 text-[12.5px] text-brand2">{error}</p> : null}

        <div className="mb-4 flex items-center justify-between text-[12.5px] text-t3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="h-3.5 w-3.5 accent-brand"
              style={{ padding: 0 }}
            />
            记住我
          </label>
          <span className="inline-flex items-center gap-1">
            <LockKeyhole size={12} />
            忘记密码请联系技术
          </span>
        </div>

        <button type="submit" className="btn btn-red w-full py-2.5 tracking-[2px]" disabled={loading}>
          {loading ? '登录中…' : '登 录'}
        </button>

        <div className="mt-4 border-t border-dashed border-line pt-3.5 text-[11.5px] leading-[1.9] text-t3">
          演示账号：<b className="font-medium text-brand2">admin</b> / 123456
          <br />
          正式环境使用数据库 <code className="text-t2">user.role='admin'</code> 账号登录。
        </div>
      </form>
      <p className="absolute inset-x-0 bottom-4 text-center text-[11.5px] tracking-[1px] text-t3">
        希尔薇图集 · 内容运营管理后台
      </p>
    </div>
  );
}
