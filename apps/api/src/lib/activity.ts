import { db } from '../db';
import { activityLog } from '../db/schema';

export type ActivityInput = {
  userId?: string | null;
  action: string;
  targetType: 'file' | 'folder' | 'share' | 'user' | 'session';
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logActivity(input: ActivityInput) {
  try {
    await db.insert(activityLog).values({
      userId: input.userId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (error) {
    console.error('No se pudo registrar la actividad:', error);
  }
}
