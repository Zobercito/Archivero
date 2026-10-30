import type { ReactNode } from 'react';
import { useAuth } from '../context/auth';
import type { Role } from '../lib/types';
import { ForbiddenPage } from '../pages/ForbiddenPage';

export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (!roles.includes(user.role)) return <ForbiddenPage />;
  return <>{children}</>;
}
