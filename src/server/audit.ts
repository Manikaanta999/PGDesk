import { db, schema } from '../db/index.ts';
import { AuthUser } from '../middleware/auth.ts';

export async function logAudit(params: {
  user: AuthUser;
  action: string;
  entityType: string;
  entityId: string | number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(schema.auditLogs).values({
      organizationId: params.user.organizationId,
      actorUserId: params.user.id,
      actorName: params.user.name,
      actorRole: params.user.role,
      action: params.action,
      entityType: params.entityType,
      entityId: String(params.entityId),
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    console.error('Audit log write failed:', err);
  }
}
