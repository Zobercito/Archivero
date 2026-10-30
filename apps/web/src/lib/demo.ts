import type { Role } from './types';

export const DEMO_MODE = import.meta.env.VITE_DEMO === 'true';

export const DEMO_PUBLIC_TOKEN = 'demo-norte-2026';

export type DemoAccount = {
  name: string;
  email: string;
  password: string;
  role: Role;
};

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    name: 'Elena Ríos',
    email: 'elena@archivero.demo',
    password: 'Admin!2026',
    role: 'admin',
  },
  {
    name: 'Mateo Vidal',
    email: 'mateo@archivero.demo',
    password: 'Editor!2026',
    role: 'editor',
  },
  {
    name: 'Sofía Marín',
    email: 'sofia@archivero.demo',
    password: 'Lector!2026',
    role: 'viewer',
  },
];
