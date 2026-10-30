import { zValidator } from '@hono/zod-validator';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { userDto } from '../dto';
import { logActivity } from '../lib/activity';
import { HttpError, validationHook } from '../lib/http';
import { hashPassword } from '../lib/password';
import {
  displayNameSchema,
  emailSchema,
  passwordSchema,
  roleSchema,
  uuidSchema,
} from '../lib/validation';
import { requireAuth, requireRole, type AppEnv } from '../middleware/auth';

const createUserSchema = z.object({
  name: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema.default('viewer'),
});

const updateUserSchema = z
  .object({
    role: roleSchema.optional(),
    disabled: z.boolean().optional(),
  })
  .refine((value) => value.role !== undefined || value.disabled !== undefined, {
    message: 'Indica al menos un cambio',
  });

function isUniqueViolation(error: unknown) {
  return (error as { code?: string }).code === '23505';
}

export const usersRoutes = new Hono<AppEnv>()
  .use('*', requireAuth, requireRole('admin'))
  .get('/', async (c) => {
    const rows = await db.select().from(users).orderBy(asc(users.name));
    return c.json({ users: rows.map(userDto) }, 200);
  })
  .post('/', zValidator('json', createUserSchema, validationHook), async (c) => {
    const currentUser = c.get('user');
    const input = c.req.valid('json');

    try {
      const [created] = await db
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          role: input.role,
          passwordHash: await hashPassword(input.password),
        })
        .returning();

      if (!created) throw new HttpError(500, 'INTERNAL_ERROR', 'No se pudo crear el usuario.');

      await logActivity({
        userId: currentUser.id,
        action: 'user.create',
        targetType: 'user',
        targetId: created.id,
        metadata: { email: created.email, role: created.role },
      });

      return c.json({ user: userDto(created) }, 201);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, 'EMAIL_IN_USE', 'Ya existe una cuenta con ese correo.');
      }
      throw error;
    }
  })
  .patch(
    '/:id',
    zValidator('param', z.object({ id: uuidSchema }), validationHook),
    zValidator('json', updateUserSchema, validationHook),
    async (c) => {
      const currentUser = c.get('user');
      const { id } = c.req.valid('param');
      const input = c.req.valid('json');

      const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!target) throw new HttpError(404, 'USER_NOT_FOUND', 'Usuario no encontrado.');

      if (id === currentUser.id && (input.role || input.disabled)) {
        throw new HttpError(
          409,
          'CANNOT_MODIFY_SELF',
          'No puedes cambiar tu propio rol ni deshabilitar tu cuenta.',
        );
      }

      const removesAdmin =
        target.role === 'admin' &&
        ((input.role !== undefined && input.role !== 'admin') || input.disabled === true);

      if (removesAdmin) {
        const remaining = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.role, 'admin'),
              isNull(users.disabledAt),
              ne(users.id, target.id),
            ),
          );

        if (remaining.length === 0) {
          throw new HttpError(
            409,
            'LAST_ADMIN',
            'Debe quedar al menos un administrador activo.',
          );
        }
      }

      const [updated] = await db
        .update(users)
        .set({
          ...(input.role === undefined ? {} : { role: input.role }),
          ...(input.disabled === undefined
            ? {}
            : { disabledAt: input.disabled ? new Date() : null }),
        })
        .where(eq(users.id, id))
        .returning();

      if (!updated) throw new HttpError(500, 'INTERNAL_ERROR', 'No se pudo actualizar.');

      await logActivity({
        userId: currentUser.id,
        action: 'user.update',
        targetType: 'user',
        targetId: updated.id,
        metadata: {
          ...(input.role === undefined ? {} : { role: input.role }),
          ...(input.disabled === undefined ? {} : { disabled: input.disabled }),
        },
      });

      return c.json({ user: userDto(updated) }, 200);
    },
  );
