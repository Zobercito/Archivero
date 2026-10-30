import { Eye, EyeOff, KeyRound, Mail } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DemoBanner } from '../components/DemoBanner';
import { LanguageToggle } from '../components/LanguageToggle';
import { Logo } from '../components/Logo';
import { RoleBadge } from '../components/RoleBadge';
import { Button, Field, Input } from '../components/ui';
import { useAuth } from '../context/auth';
import { type TranslationKey, useI18n } from '../i18n';
import { DEMO_ACCOUNTS, DEMO_MODE } from '../lib/demo';
import { errorText } from '../lib/errors';

const DEMO_EMAIL = 'sofia@archivero.demo';
const DEMO_PASSWORD = 'Lector!2026';

const features: Array<[string, TranslationKey, TranslationKey]> = [
  ['01', 'login.feature1Title', 'login.feature1Body'],
  ['02', 'login.feature2Title', 'login.feature2Body'],
  ['03', 'login.feature3Title', 'login.feature3Body'],
];

export function LoginPage() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const destination = from && from !== '/login' ? from : '/';

  const enter = async (credentials: { email: string; password: string }) => {
    setBusy(true);
    setError(null);
    try {
      await login(credentials);
      navigate(destination, { replace: true });
    } catch (cause) {
      setError(errorText(t, cause));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void enter({ email: email.trim(), password });
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
      <aside className="relative hidden overflow-hidden bg-ink px-12 py-10 text-paper lg:flex lg:flex-col xl:px-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent 0, transparent 43px, #f6f1e7 43px, #f6f1e7 44px)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full border border-paper/10"
        />

        <div className="relative flex items-center gap-3">
          <Logo className="size-9 text-paper" />
          <div>
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-paper/55">
              {t('shell.archiveLabel')}
            </p>
            <p className="font-display text-2xl font-semibold leading-none">Archivero</p>
          </div>
        </div>

        <div className="relative my-auto max-w-lg py-16">
          <p className="mb-5 text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-[#e2a184]">
            {t('app.tagline')}
          </p>
          <h1 className="font-display text-5xl font-semibold leading-[1.02] tracking-[-0.03em] xl:text-6xl">
            {t('login.sideTitle')}
          </h1>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-paper/65">
            {t('login.sideBody')}
          </p>

          <ul className="mt-10 space-y-5 border-t border-paper/15 pt-8">
            {features.map(([number, title, body]) => (
              <li key={number} className="flex gap-4">
                <span className="mt-0.5 font-display text-sm text-[#e2a184]">{number}</span>
                <div>
                  <p className="text-sm font-semibold text-paper">{t(title)}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-paper/55">{t(body)}</p>
                </div>
              </li>
            ))}
          </ul>

          <span className="absolute -bottom-2 right-0 hidden rotate-[-4deg] border-2 border-paper/35 px-4 py-2 text-[0.6rem] font-bold uppercase tracking-[0.26em] text-paper/70 xl:inline-flex">
            {t('login.stamp')}
          </span>
        </div>

        <p className="relative text-[0.65rem] uppercase tracking-[0.2em] text-paper/35">
          {t('app.footer')}
        </p>
      </aside>

      <main className="flex flex-col bg-paper px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 lg:invisible">
            <Logo className="size-7 text-ink" />
            <span className="display text-lg">Archivero</span>
          </div>
          <LanguageToggle />
        </div>

        <div className="mx-auto flex w-full max-w-[390px] flex-1 flex-col justify-center py-12">
          <DemoBanner />
          <p className="eyebrow">{t('login.eyebrow')}</p>
          <h2 className="display mt-3 text-4xl leading-tight">{t('login.title')}</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">{t('login.subtitle')}</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
            <Field label={t('login.email')} htmlFor="email">
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
                  aria-hidden
                />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  className="pl-9"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </Field>

            <Field label={t('login.password')} htmlFor="password">
              <div className="relative">
                <KeyRound
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
                  aria-hidden
                />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="px-9"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={t(showPassword ? 'login.hidePassword' : 'login.showPassword')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-faint transition hover:text-ink"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </div>
            </Field>

            {error && (
              <div
                role="alert"
                className="border border-danger/30 border-l-4 border-l-danger bg-danger-soft px-3 py-2.5 text-xs leading-relaxed text-danger"
              >
                {error}
              </div>
            )}

            <Button type="submit" loading={busy} className="w-full uppercase tracking-[0.16em]">
              {busy ? t('login.submitting') : t('login.submit')}
            </Button>
          </form>

          {DEMO_MODE ? (
            <div className="mt-8 border border-dashed border-rule-strong/70 bg-paper-light/60 p-4">
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.2em] text-terracotta">
                {t('demo.loginTitle')}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{t('demo.loginBody')}</p>

              <div className="mt-3 grid gap-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    disabled={busy}
                    onClick={() => void enter({ email: account.email, password: account.password })}
                    className="flex w-full items-center justify-between gap-3 border border-rule bg-paper-light px-3 py-2.5 text-left transition hover:border-terracotta/50 hover:bg-terracotta-soft/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {account.name}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[0.62rem] text-ink-faint">
                        {account.email}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <RoleBadge role={account.role} />
                      <span className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-terracotta">
                        {t('demo.enter')}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <p className="mt-3 text-[0.65rem] leading-relaxed text-ink-faint">
                {t('demo.resetNote')}
              </p>
            </div>
          ) : (
            <div className="mt-8 border border-dashed border-rule-strong/70 bg-paper-light/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.2em] text-terracotta">
                    {t('login.demoTitle')}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                    {t('login.demoBody')}
                  </p>
                </div>
                <span className="stamp shrink-0 px-2 py-1 text-[0.5rem]">
                  {t('shell.role.viewer')}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-rule/80 pt-3 text-[0.7rem]">
                <dt className="uppercase tracking-[0.14em] text-ink-faint">
                  {t('login.demoEmailLabel')}
                </dt>
                <dd className="truncate font-mono text-ink">{DEMO_EMAIL}</dd>
                <dt className="uppercase tracking-[0.14em] text-ink-faint">
                  {t('login.demoPasswordLabel')}
                </dt>
                <dd className="font-mono text-ink">{DEMO_PASSWORD}</dd>
              </dl>

              <Button
                variant="secondary"
                size="sm"
                className="mt-3 w-full"
                disabled={busy}
                onClick={() => void enter({ email: DEMO_EMAIL, password: DEMO_PASSWORD })}
              >
                {t('login.demoAction')}
              </Button>
            </div>
          )}
        </div>

        <p className="mx-auto max-w-[390px] text-center text-[0.65rem] leading-relaxed text-ink-faint">
          {t('login.footer')}
        </p>
      </main>
    </div>
  );
}
