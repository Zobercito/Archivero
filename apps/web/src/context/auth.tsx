import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { api, unwrap } from '../lib/api';
import type { LoginUser, SessionUser } from '../lib/types';

type AuthValue = {
  user: SessionUser | null;
  isLoading: boolean;
  login: (input: { email: string; password: string }) => Promise<LoginUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

async function fetchMe(): Promise<SessionUser | null> {
  const response = await api.api.auth.me.$get();
  if ((response.status as number) === 401) return null;
  const body = await unwrap(response);
  return body.user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000,
  });

  const loginMutation = useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const response = await api.api.auth.login.$post({ json: input });
      return (await unwrap(response)).user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
      queryClient.invalidateQueries();
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.api.auth.logout.$post();
    },
    onSuccess: () => {
      queryClient.setQueryData(['me'], null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
    },
  });

  const value = useMemo<AuthValue>(
    () => ({
      user: meQuery.data ?? null,
      isLoading: meQuery.isLoading,
      login: async (input) => loginMutation.mutateAsync(input),
      logout: async () => {
        await logoutMutation.mutateAsync();
      },
      refresh: async () => {
        await meQuery.refetch();
      },
    }),
    [meQuery.data, meQuery.isLoading, meQuery.refetch, loginMutation, logoutMutation],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
