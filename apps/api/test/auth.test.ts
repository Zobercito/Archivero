import { beforeEach, describe, expect, it } from 'vitest';
import { accounts, api, login, loginAs, resetDatabase } from './helpers';

beforeEach(resetDatabase);

describe('autenticación', () => {
  it('inicia sesión con credenciales válidas y cookie httpOnly', async () => {
    const result = await login(accounts.admin.email, accounts.admin.password);

    expect(result.status).toBe(200);
    expect(result.body.user).toMatchObject({
      email: accounts.admin.email,
      role: 'admin',
      disabled: false,
    });
    expect(result.body.user).not.toHaveProperty('passwordHash');
    expect(result.cookie).toMatch(/^archivero_session=/);
    expect(result.setCookie.toLowerCase()).toContain('httponly');
    expect(result.setCookie.toLowerCase()).toContain('samesite=lax');
  });

  it('rechaza una contraseña incorrecta sin revelar si el correo existe', async () => {
    const wrongPassword = await login(accounts.viewer.email, 'contraseña-incorrecta');
    const unknownEmail = await login('nadie@archivero.test', 'contraseña-incorrecta');

    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('rechaza cuentas deshabilitadas', async () => {
    const result = await login('disabled@archivero.test', 'Disabled!2026');

    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('devuelve la sesión actual solo con cookie válida', async () => {
    const session = await loginAs('editor');

    const withCookie = await api('/api/auth/me', { cookie: session.cookie });
    expect(withCookie.status).toBe(200);
    expect(withCookie.body.user.email).toBe(accounts.editor.email);

    const withoutCookie = await api('/api/auth/me');
    expect(withoutCookie.status).toBe(401);
    expect(withoutCookie.body.error.code).toBe('UNAUTHENTICATED');

    const forged = await api('/api/auth/me', { cookie: 'archivero_session=inventada' });
    expect(forged.status).toBe(401);
  });

  it('cierra la sesión eliminando la cookie', async () => {
    const session = await loginAs('viewer');
    const result = await api('/api/auth/logout', { method: 'POST', cookie: session.cookie });

    expect(result.status).toBe(200);
    expect(result.res.headers.get('set-cookie')?.toLowerCase()).toContain('max-age=0');
  });

  it('limita los intentos de inicio de sesión por IP', async () => {
    const ip = '203.0.113.10';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: { email: accounts.viewer.email, password: 'incorrecta' },
        ip,
      });
      expect(result.status).toBe(401);
    }

    const blocked = await api('/api/auth/login', {
      method: 'POST',
      body: { email: accounts.viewer.email, password: accounts.viewer.password },
      ip,
    });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});
