import { eq } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { db } from '../db';
import { users, type UserRole } from '../db/schema';
import { HttpError } from '../lib/http';
import { clearSessionCookie, readSessionToken } from '../lib/session';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export type AppEnv = {
  Variables: {
    user: SessionUser;
  };
};

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const userId = await readSessionToken(c);
  if (!userId) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Debes iniciar sesión.');
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || user.disabledAt) {
    clearSessionCookie(c);
    throw new HttpError(401, 'UNAUTHENTICATED', 'La sesión no es válida.');
  }

  c.set('user', {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  await next();
});

export function requireRole(...roles: UserRole[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    if (!roles.includes(user.role)) {
      throw new HttpError(403, 'FORBIDDEN', 'No tienes permiso para esta acción.');
    }
    await next();
  });
}
