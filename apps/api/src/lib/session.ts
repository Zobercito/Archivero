import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { env, isProduction } from '../env';

export const SESSION_COOKIE = 'archivero_session';
const sessionSeconds = env.SESSION_TTL_HOURS * 60 * 60;

export async function createSessionToken(userId: string) {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: userId,
      iat: now,
      exp: now + sessionSeconds,
      scope: 'session',
    },
    env.JWT_SECRET,
  );
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Lax',
    path: '/',
    maxAge: sessionSeconds,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, {
    path: '/',
    secure: isProduction,
    sameSite: 'Lax',
  });
}

export async function readSessionToken(c: Context) {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;

  try {
    const payload = await verify(token, env.JWT_SECRET, 'HS256');
    if (payload.scope !== 'session' || typeof payload.sub !== 'string') return null;
    return payload.sub;
  } catch {
    return null;
  }
}
