import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, UserPlus, Users } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/PageHeader';
import { RoleBadge } from '../components/RoleBadge';
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Spinner } from '../components/ui';
import { useAuth } from '../context/auth';
import { useToast } from '../context/toast';
import { useI18n } from '../i18n';
import { api, unwrap } from '../lib/api';
import { errorText } from '../lib/errors';
import { formatDate, initials } from '../lib/format';
import type { Role, UserItem } from '../lib/types';

type UserPatch = { role?: Role; disabled?: boolean };
type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role: Role;
};

export function UsersPage() {
  const { t, locale } = useI18n();
  const { user: currentUser } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [disableTarget, setDisableTarget] = useState<UserItem | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.api.users.$get();
      return (await unwrap(response)).users;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UserPatch }) =>
      unwrap(await api.api.users[':id'].$patch({ param: { id }, json: patch })),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setDisableTarget(null);
      if (variables.patch.role !== undefined) {
        notify(t('users.roleUpdated'), 'success');
      } else if (variables.patch.disabled === true) {
        notify(t('users.disableToast'), 'success');
      } else {
        notify(t('users.enableToast'), 'success');
      }
    },
    onError: (cause) => {
      notify(errorText(t, cause), 'error');
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateUserInput) =>
      unwrap(await api.api.users.$post({ json: input })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      notify(t('users.createdToast'), 'success');
      setCreateOpen(false);
    },
  });

  const users = usersQuery.data ?? [];

  const openCreate = () => {
    createMutation.reset();
    setCreateOpen(true);
  };

  return (
    <div className="animate-enter">
      <PageHeader
        eyebrow={t('shell.users')}
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        actions={
          <Button onClick={openCreate}>
            <UserPlus className="size-4" aria-hidden />
            {t('users.new')}
          </Button>
        }
      />

      {usersQuery.isError ? (
        <div className="mt-6 border border-danger/30 border-l-4 border-l-danger bg-danger-soft px-5 py-6">
          <p className="text-sm text-danger">{t('users.error')}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => void usersQuery.refetch()}
          >
            {t('common.retry')}
          </Button>
        </div>
      ) : usersQuery.isLoading ? (
        <div className="mt-6 flex items-center gap-3 border border-rule bg-paper-light px-5 py-10 text-sm text-ink-soft">
          <Spinner className="size-4 text-terracotta" />
          {t('users.loading')}
        </div>
      ) : users.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Users className="size-5" aria-hidden />}
            title={t('users.empty')}
            body={t('users.subtitle')}
            action={
              <Button onClick={openCreate}>
                <UserPlus className="size-4" aria-hidden />
                {t('users.new')}
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-rule border border-rule bg-paper-light">
          {users.map((account) => {
            const isSelf = account.id === currentUser?.id;
            const pending = updateMutation.isPending && updateMutation.variables?.id === account.id;
            return (
              <li key={account.id} className="px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-rule bg-paper text-xs font-semibold text-ink-soft">
                    {initials(account.name)}
                  </span>
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-ink">{account.name}</p>
                      {isSelf && <Badge tone="accent">{t('users.you')}</Badge>}
                      {account.disabled && <Badge tone="danger">{t('users.disabled')}</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-faint">
                      {account.email}
                      {' · '}
                      {t('users.created')} {formatDate(account.createdAt, locale)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {isSelf ? (
                      <RoleBadge role={account.role} />
                    ) : (
                      <Select
                        aria-label={t('users.changeRole')}
                        className="w-[150px] py-1.5 text-xs"
                        value={account.role}
                        disabled={pending}
                        onChange={(event) =>
                          updateMutation.mutate({
                            id: account.id,
                            patch: { role: event.target.value as Role },
                          })
                        }
                      >
                        {(['admin', 'editor', 'viewer'] as const).map((role) => (
                          <option key={role} value={role}>
                            {t(`users.role.${role}`)}
                          </option>
                        ))}
                      </Select>
                    )}

                    <Button
                      variant={account.disabled ? 'secondary' : 'ghost'}
                      size="sm"
                      disabled={isSelf || pending}
                      onClick={() => {
                        if (account.disabled) {
                          updateMutation.mutate({
                            id: account.id,
                            patch: { disabled: false },
                          });
                        } else {
                          setDisableTarget(account);
                        }
                      }}
                    >
                      {account.disabled ? (
                        <CheckCircle2 className="size-3.5" aria-hidden />
                      ) : (
                        <Ban className="size-3.5" aria-hidden />
                      )}
                      {account.disabled ? t('users.enable') : t('users.disable')}
                    </Button>
                  </div>
                </div>
                {isSelf && (
                  <p className="mt-1.5 pl-12 text-[0.68rem] text-ink-faint">{t('users.self')}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mutation={createMutation}
      />

      <ConfirmDialog
        open={Boolean(disableTarget)}
        title={t('users.disableConfirmTitle')}
        body={t('users.disableConfirmBody', { name: disableTarget?.name ?? '' })}
        confirmLabel={t('users.disableConfirm')}
        loading={updateMutation.isPending}
        onClose={() => setDisableTarget(null)}
        onConfirm={() => {
          if (disableTarget) {
            updateMutation.mutate({
              id: disableTarget.id,
              patch: { disabled: true },
            });
          }
        }}
      />
    </div>
  );
}

function CreateUserDialog({
  open,
  onClose,
  mutation,
}: {
  open: boolean;
  onClose: () => void;
  mutation: {
    mutate: (input: CreateUserInput) => void;
    isPending: boolean;
    isError: boolean;
    error: unknown;
  };
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setPassword('');
      setRole('viewer');
      setError(null);
    }
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError(t('errors.VALIDATION_ERROR'));
      return;
    }
    if (!email.includes('@')) {
      setError(t('errors.VALIDATION_ERROR'));
      return;
    }
    if (password.length < 10) {
      setError(t('users.passwordHint'));
      return;
    }
    mutation.mutate({ name: name.trim(), email: email.trim(), password, role });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={t('shell.users')}
      title={t('users.createTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="create-user-form" loading={mutation.isPending}>
            {t('users.createSubmit')}
          </Button>
        </>
      }
    >
      <form id="create-user-form" onSubmit={submit} className="space-y-4">
        <Field label={t('users.name')} htmlFor="user-name">
          <Input
            id="user-name"
            autoFocus
            maxLength={120}
            placeholder={t('users.namePlaceholder')}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label={t('users.email')} htmlFor="user-email" hint={t('users.emailHint')}>
          <Input
            id="user-email"
            type="email"
            maxLength={254}
            placeholder={t('users.emailPlaceholder')}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label={t('users.password')} htmlFor="user-password" hint={t('users.passwordHint')}>
          <Input
            id="user-password"
            type="password"
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field label={t('users.role')} htmlFor="user-role" hint={t('users.roleHint')}>
          <Select
            id="user-role"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
          >
            {(['viewer', 'editor', 'admin'] as const).map((value) => (
              <option key={value} value={value}>
                {t(`users.role.${value}`)}
              </option>
            ))}
          </Select>
        </Field>

        {(error || mutation.isError) && (
          <p
            role="alert"
            className="border border-danger/30 border-l-4 border-l-danger bg-danger-soft px-3 py-2 text-xs text-danger"
          >
            {error ?? (mutation.error ? errorText(t, mutation.error) : t('users.createError'))}
          </p>
        )}
      </form>
    </Modal>
  );
}
