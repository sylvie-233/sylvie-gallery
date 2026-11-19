import { Navigate, Route, Routes } from 'react-router-dom';

import { AgentTokensPage } from './pages/agent-tokens';

import { AdminLayout } from '@/components/admin-layout';
import { useAdminAuth } from '@/lib/auth';
import { AlbumEditorPage } from '@/pages/album-editor';
import { AlbumsPage } from '@/pages/albums';
import { AnnouncementsPage } from '@/pages/announcements';
import { AuthorsPage } from '@/pages/authors';
import { CommentsPage } from '@/pages/comments';
import { ConfigPage } from '@/pages/config';
import { DashboardPage } from '@/pages/dashboard';
import { LoginPage } from '@/pages/login';
import { LogsPage } from '@/pages/logs';
import { PaymentsPage } from '@/pages/payments';
import { TagsPage } from '@/pages/tags';
import { UsersPage } from '@/pages/users';

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-11 w-11 animate-pulse items-center justify-center rounded-xl bg-[linear-gradient(135deg,#ff2d55,#ff4b6b)] text-[20px] font-bold text-white">
          希
        </span>
        <span className="text-[12px] text-t3">正在验证管理员身份…</span>
      </div>
    </div>
  );
}

function RequireAuth() {
  const { initialized, token, user } = useAdminAuth();
  if (!initialized) {
    return <LoadingScreen />;
  }
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (!user) {
    return <LoadingScreen />;
  }
  return <AdminLayout />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/albums" element={<AlbumsPage />} />
        <Route path="/albums/new" element={<AlbumEditorPage />} />
        <Route path="/albums/:id/edit" element={<AlbumEditorPage />} />
        <Route path="/tags" element={<TagsPage />} />
        <Route path="/authors" element={<AuthorsPage />} />
        <Route path="/comments" element={<CommentsPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/config" element={<ConfigPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/agent-tokens" element={<AgentTokensPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
