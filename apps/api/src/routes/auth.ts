import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { userDto } from '../dto';
import { logActivity } from '../lib/activity';
import { HttpError, validationHook } from '../lib/http';
import { verifyPassword } from '../lib/password';
import { rateLimit } from '../lib/rate-limit';
import { clearSessionCookie, createSessionToken, setSessionCookie } from '../lib/session';
import { emailSchema } from '../lib/validation';
import { type AppEnv, requireAuth } from '../middleware/auth';

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const authRoutes = new Hono<AppEnv>()
  .post(
    '/login',
    rateLimit({ name: 'login', limit: 10, windowMs: 15 * 60 * 1000 }),
    zValidator('json', loginSchema, validationHook),
    async (c) => {
      const { email, password } = c.req.valid('json');

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

      const passwordOk = user ? await verifyPassword(user.passwordHash, password) : false;

      if (!user || user.disabledAt || !passwordOk) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
      }

      const token = await createSessionToken(user.id);
      setSessionCookie(c, token);
      await logActivity({
        userId: user.id,
        action: 'session.login',
        targetType: 'session',
        targetId: user.id,
      });

      return c.json({ user: userDto(user) }, 200);
    },
  )
  .post('/logout', (c) => {
    clearSessionCookie(c);
    return c.json({ ok: true }, 200);
  })
  .get('/me', requireAuth, (c) => {
    return c.json({ user: c.get('user') }, 200);
  });
