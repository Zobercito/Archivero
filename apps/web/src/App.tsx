import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Logo } from './components/Logo';
import { Spinner } from './components/ui';
import { useAuth } from './context/auth';
import { useI18n } from './i18n';
import { BrowsePage } from './pages/BrowsePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

function Splash() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Logo className="size-10 text-ink" />
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.3em] text-ink-faint">
        {t('app.name')}
      </p>
      <Spinner className="size-4 text-terracotta" />
    </div>
  );
}

function RequireAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <Splash />;
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  return <Outlet />;
}

function LoginRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Splash />;
  if (user) return <Navigate to="/" replace />;
  return <LoginPage />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<BrowsePage />} />
            <Route path="folder/:folderId" element={<BrowsePage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
