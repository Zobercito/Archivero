import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './context/auth';
import { ToastProvider } from './context/toast';
import { I18nProvider } from './i18n';
import { ApiError } from './lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

async function bootstrap(root: HTMLElement) {
  if (import.meta.env.VITE_DEMO === 'true') {
    const { installDemoBackend } = await import('./demo');
    installDemoBackend();
  }

  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </I18nProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

void bootstrap(container);
