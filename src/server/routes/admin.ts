import { Router } from 'express';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import {
  generateOwnerRegistrationToken,
  PLATFORM_ORG_SLUG,
  resolveOwnerTokenStatus,
  sanitizeAdminStudentRow,
} from '../../lib/platformAuth.ts';
import { hashToken } from '../../lib/security.ts';
import { AuthRequest, requireAuth, requireRole } from '../../middleware/auth.ts';
import { ensurePlatformOrg, getAdminBootstrapStatus } from '../adminBootstrap.ts';
import { logAudit } from '../audit.ts';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.get('/overview', async (_req: AuthRequest, res) => {
  try {
    const [orgs, users, props, tenants, enquiries, tokens, auditLogs, bootstrap] = await Promise.all([
      db.select().from(schema.organizations).where(ne(schema.organizations.slug, PLATFORM_ORG_SLUG)),
      db.select({
        id: schema.users.id,
        organizationId: schema.users.organizationId,
        role: schema.users.role,
        isActive: schema.users.isActive,
      }).from(schema.users),
      db.select().from(schema.properties).where(isNull(schema.properties.deletedAt)),
      db.select({
        id: schema.tenants.id,
        userId: schema.tenants.userId,
        status: schema.tenants.status,
        accountLinkStatus: schema.tenants.accountLinkStatus,
      }).from(schema.tenants).where(isNull(schema.tenants.deletedAt)),
      db.select({
        id: schema.enquiries.id,
        status: schema.enquiries.status,
      }).from(schema.enquiries),
      db.select({
        id: schema.ownerRegistrationTokens.id,
        status: schema.ownerRegistrationTokens.status,
        expiresAt: schema.ownerRegistrationTokens.expiresAt,
      }).from(schema.ownerRegistrationTokens),
      db.select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.createdAt)).limit(12),
      getAdminBootstrapStatus(),
    ]);

    const customerOrgIds = new Set(orgs.map((o) => o.id));
    const totalOwners = users.filter((u) => u.role === 'OWNER' && u.isActive && customerOrgIds.has(u.organizationId)).length;
    const customerProps = props.filter((p) => customerOrgIds.has(p.organizationId));
    const totalHostels = customerProps.length;
    const activeHostels = customerProps.filter((p) => p.isPublic).length;
    const totalStudentRecords = tenants.length;
    const activeStays = tenants.filter((t) => t.status === 'ACTIVE' || t.status === 'NOTICE').length;
    const studentsWithAccounts = tenants.filter((t) => t.userId !== null).length;
    const studentsWithoutAccounts = tenants.filter((t) => t.userId === null).length;
    const pendingAccountLinks = tenants.filter((t) => t.accountLinkStatus === 'LINK_PENDING').length;
    const pendingEnquiries = enquiries.filter((e) =>
      e.status === 'NEW_ENQUIRY' || e.status === 'CONTACTED' || e.status === 'APPROVED'
    ).length;
    const now = new Date();
    const unusedOwnerTokens = tokens.filter((t) => resolveOwnerTokenStatus(t, now) === 'UNUSED').length;

    return res.json({
      metrics: {
        totalOwners,
        totalHostels,
        activeHostels,
        totalStudentRecords,
        activeStays,
        studentsWithAccounts,
        studentsWithoutAccounts,
        pendingAccountLinks,
        pendingEnquiries,
        unusedOwnerTokens,
      },
      bootstrap,
      recentAuditLogs: auditLogs.map((l) => ({
        id: l.id,
        actorName: l.actorName,
        actorRole: l.actorRole,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        metadata: l.metadata,
        createdAt: l.createdAt,
      })),
    });
  } catch (err) {
    console.error('GET /api/admin/overview error:', err);
    return res.status(500).json({ error: 'Failed to load admin overview' });
  }
});

adminRouter.get('/tokens', async (_req: AuthRequest, res) => {
  try {
    const [tokens, users, orgs] = await Promise.all([
      db.select().from(schema.ownerRegistrationTokens).orderBy(desc(schema.ownerRegistrationTokens.createdAt)),
      db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.users),
      db.select({ id: schema.organizations.id, name: schema.organizations.name }).from(schema.organizations),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    const now = new Date();

    return res.json({
      tokens: tokens.map((t) => {
        const usedUser = t.usedByUserId ? userMap.get(t.usedByUserId) : null;
        const usedOrg = t.usedByOrganizationId ? orgMap.get(t.usedByOrganizationId) : null;
        const createdUser = t.createdByUserId ? userMap.get(t.createdByUserId) : null;
        return {
          id: t.id,
          tokenMask: `PGDESKOWNER-••••-••••-${t.tokenLast4}`,
          tokenLast4: t.tokenLast4,
          note: t.note,
          status: resolveOwnerTokenStatus(t, now),
          expiresAt: t.expiresAt,
          createdAt: t.createdAt,
          createdByName: createdUser?.name || 'Admin',
          usedAt: t.usedAt,
          usedByName: usedUser?.name || null,
          usedByEmail: usedUser?.email || null,
          usedByOrganizationName: usedOrg?.name || null,
          revokedAt: t.revokedAt,
        };
      }),
    });
  } catch (err) {
    console.error('GET /api/admin/tokens error:', err);
    return res.status(500).json({ error: 'Failed to load owner registration tokens' });
  }
});

adminRouter.post('/tokens', async (req: AuthRequest, res) => {
  try {
    const adminUser = req.user!;
    const rawCount = Number(req.body?.count ?? 1);
    const count = Number.isFinite(rawCount) ? Math.min(50, Math.max(1, Math.floor(rawCount))) : 1;
    const note = String(req.body?.note || '').trim().slice(0, 160);

    let expiresAt: Date;
    if (req.body?.expiresAt) {
      const parsedDate = new Date(String(req.body.expiresAt));
      if (Number.isNaN(parsedDate.getTime()) || parsedDate.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'Expiry date must be in the future' });
      }
      expiresAt = parsedDate;
    } else {
      const days = Math.min(365, Math.max(1, Math.floor(Number(req.body?.expiresInDays ?? 30))));
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    const generated: Array<{
      id: number;
      token: string;
      tokenLast4: string;
      note: string;
      status: 'UNUSED';
      expiresAt: Date;
      createdAt: Date;
    }> = [];

    for (let i = 0; i < count; i += 1) {
      const plaintext = generateOwnerRegistrationToken();
      const tokenLast4 = plaintext.slice(-4);
      const [inserted] = await db
        .insert(schema.ownerRegistrationTokens)
        .values({
          tokenHash: hashToken(plaintext),
          tokenLast4,
          note,
          status: 'UNUSED',
          expiresAt,
          createdByUserId: adminUser.id,
        })
        .returning();

      generated.push({
        id: inserted.id,
        token: plaintext,
        tokenLast4: inserted.tokenLast4,
        note: inserted.note,
        status: 'UNUSED',
        expiresAt: inserted.expiresAt,
        createdAt: inserted.createdAt,
      });
    }

    await logAudit({
      user: adminUser,
      action: 'OWNER_TOKEN_GENERATED',
      entityType: 'OWNER_TOKEN',
      entityId: generated.map((g) => g.id).join(','),
      metadata: {
        count: generated.length,
        tokenLast4List: generated.map((g) => g.tokenLast4),
        expiresAt: expiresAt.toISOString(),
      },
    });

    return res.status(201).json({
      tokens: generated,
      message: `${generated.length} owner registration ${generated.length === 1 ? 'token' : 'tokens'} generated. Copy now — plaintext tokens are shown only once.`,
    });
  } catch (err) {
    console.error('POST /api/admin/tokens error:', err);
    return res.status(500).json({ error: 'Failed to generate owner registration tokens' });
  }
});

adminRouter.post('/tokens/:id/revoke', async (req: AuthRequest, res) => {
  try {
    const adminUser = req.user!;
    const tokenId = Number(req.params.id);
    if (!Number.isFinite(tokenId) || tokenId <= 0) {
      return res.status(400).json({ error: 'Invalid token ID' });
    }

    const [updated] = await db
      .update(schema.ownerRegistrationTokens)
      .set({
        status: 'REVOKED',
        revokedByUserId: adminUser.id,
        revokedAt: new Date(),
      })
      .where(
        and(
          eq(schema.ownerRegistrationTokens.id, tokenId),
          eq(schema.ownerRegistrationTokens.status, 'UNUSED')
        )
      )
      .returning();

    if (!updated) {
      return res.status(409).json({ error: 'Only unused tokens can be revoked' });
    }

    await logAudit({
      user: adminUser,
      action: 'OWNER_TOKEN_REVOKED',
      entityType: 'OWNER_TOKEN',
      entityId: updated.id,
      metadata: { tokenLast4: updated.tokenLast4 },
    });

    return res.json({
      ok: true,
      token: {
        id: updated.id,
        status: updated.status,
        revokedAt: updated.revokedAt,
      },
    });
  } catch (err) {
    console.error('POST /api/admin/tokens/:id/revoke error:', err);
    return res.status(500).json({ error: 'Failed to revoke token' });
  }
});

adminRouter.get('/owners', async (_req: AuthRequest, res) => {
  try {
    const [orgs, users, props, tenants] = await Promise.all([
      db.select().from(schema.organizations).where(ne(schema.organizations.slug, PLATFORM_ORG_SLUG)),
      db.select({
        id: schema.users.id,
        organizationId: schema.users.organizationId,
        name: schema.users.name,
        email: schema.users.email,
        phone: schema.users.phone,
        role: schema.users.role,
        isActive: schema.users.isActive,
        emailVerified: schema.users.emailVerified,
        phoneVerified: schema.users.phoneVerified,
        lastLoginAt: schema.users.lastLoginAt,
        createdAt: schema.users.createdAt,
      }).from(schema.users).where(eq(schema.users.role, 'OWNER')).orderBy(desc(schema.users.createdAt)),
      db.select({
        id: schema.properties.id,
        organizationId: schema.properties.organizationId,
      }).from(schema.properties).where(isNull(schema.properties.deletedAt)),
      db.select({
        id: schema.tenants.id,
        organizationId: schema.tenants.organizationId,
      }).from(schema.tenants).where(isNull(schema.tenants.deletedAt)),
    ]);

    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    return res.json({
      owners: users
        .filter((u) => orgMap.has(u.organizationId))
        .map((u) => {
          const org = orgMap.get(u.organizationId)!;
          return {
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            emailVerified: u.emailVerified,
            phoneVerified: u.phoneVerified,
            isActive: u.isActive,
            organizationId: org.id,
            organizationName: org.name,
            hostelCount: props.filter((p) => p.organizationId === org.id).length,
            studentCount: tenants.filter((t) => t.organizationId === org.id).length,
            lastLoginAt: u.lastLoginAt,
            createdAt: u.createdAt,
          };
        }),
    });
  } catch (err) {
    console.error('GET /api/admin/owners error:', err);
    return res.status(500).json({ error: 'Failed to load owners' });
  }
});

adminRouter.get('/hostels', async (_req: AuthRequest, res) => {
  try {
    const [orgs, owners, props, beds, tenants] = await Promise.all([
      db.select().from(schema.organizations).where(ne(schema.organizations.slug, PLATFORM_ORG_SLUG)),
      db.select({
        id: schema.users.id,
        organizationId: schema.users.organizationId,
        name: schema.users.name,
        email: schema.users.email,
      }).from(schema.users).where(eq(schema.users.role, 'OWNER')),
      db.select().from(schema.properties).where(isNull(schema.properties.deletedAt)).orderBy(desc(schema.properties.createdAt)),
      db.select({ id: schema.beds.id, propertyId: schema.beds.propertyId, status: schema.beds.status }).from(schema.beds),
      db.select({ id: schema.tenants.id, propertyId: schema.tenants.propertyId, status: schema.tenants.status }).from(schema.tenants).where(isNull(schema.tenants.deletedAt)),
    ]);

    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    const ownerByOrg = new Map<number, { name: string; email: string }>();
    for (const o of owners) {
      if (!ownerByOrg.has(o.organizationId)) {
        ownerByOrg.set(o.organizationId, { name: o.name, email: o.email });
      }
    }

    return res.json({
      hostels: props
        .filter((p) => orgMap.has(p.organizationId))
        .map((p) => {
          const pBeds = beds.filter((b) => b.propertyId === p.id);
          const pTenants = tenants.filter((t) => t.propertyId === p.id);
          const owner = ownerByOrg.get(p.organizationId);
          return {
            id: p.id,
            name: p.name,
            slug: p.slug,
            city: p.city,
            locality: p.locality,
            genderType: p.genderType,
            isPublic: p.isPublic,
            organizationName: orgMap.get(p.organizationId)?.name || '',
            ownerName: owner?.name || 'Owner',
            ownerEmail: owner?.email || '',
            totalBeds: pBeds.length,
            occupiedBeds: pBeds.filter((b) => b.status === 'OCCUPIED').length,
            studentCount: pTenants.length,
            activeStudentCount: pTenants.filter((t) => t.status === 'ACTIVE' || t.status === 'NOTICE').length,
            createdAt: p.createdAt,
          };
        }),
    });
  } catch (err) {
    console.error('GET /api/admin/hostels error:', err);
    return res.status(500).json({ error: 'Failed to load hostels' });
  }
});

adminRouter.get('/students', async (req: AuthRequest, res) => {
  try {
    const filter = String(req.query.filter || 'ALL').toUpperCase();
    const search = String(req.query.search || '').trim().toLowerCase();

    const [orgs, props, tenants, beds, rooms] = await Promise.all([
      db.select({ id: schema.organizations.id, name: schema.organizations.name }).from(schema.organizations),
      db.select({ id: schema.properties.id, name: schema.properties.name }).from(schema.properties),
      db.select({
        id: schema.tenants.id,
        name: schema.tenants.name,
        phone: schema.tenants.phone,
        email: schema.tenants.email,
        propertyId: schema.tenants.propertyId,
        organizationId: schema.tenants.organizationId,
        bedId: schema.tenants.bedId,
        status: schema.tenants.status,
        userId: schema.tenants.userId,
        accountLinkStatus: schema.tenants.accountLinkStatus,
        joinDate: schema.tenants.joinDate,
        leaveDate: schema.tenants.leaveDate,
      }).from(schema.tenants).where(isNull(schema.tenants.deletedAt)).orderBy(desc(schema.tenants.createdAt)),
      db.select({ id: schema.beds.id, bedLabel: schema.beds.bedLabel, roomId: schema.beds.roomId }).from(schema.beds),
      db.select({ id: schema.rooms.id, roomNumber: schema.rooms.roomNumber }).from(schema.rooms),
    ]);

    const orgMap = new Map(orgs.map((o) => [o.id, o.name]));
    const propMap = new Map(props.map((p) => [p.id, p.name]));
    const bedMap = new Map(beds.map((b) => [b.id, b]));
    const roomMap = new Map(rooms.map((r) => [r.id, r]));

    let rows = tenants.map((t) => {
      const bed = t.bedId ? bedMap.get(t.bedId) : undefined;
      const room = bed ? roomMap.get(bed.roomId) : undefined;
      return sanitizeAdminStudentRow({
        id: t.id,
        name: t.name,
        phone: t.phone,
        email: t.email,
        propertyId: t.propertyId,
        propertyName: propMap.get(t.propertyId) || '',
        organizationId: t.organizationId,
        organizationName: orgMap.get(t.organizationId) || '',
        roomNumber: room?.roomNumber || null,
        bedLabel: bed?.bedLabel || null,
        status: t.status,
        userId: t.userId,
        accountLinkStatus: t.accountLinkStatus,
        joinDate: t.joinDate,
        leaveDate: t.leaveDate,
      });
    });

    if (filter === 'HAS_ACCOUNT') rows = rows.filter((r) => r.hasAccount);
    else if (filter === 'NO_ACCOUNT') rows = rows.filter((r) => !r.hasAccount);
    else if (filter === 'LINKED') rows = rows.filter((r) => r.accountLinkStatus === 'LINKED');
    else if (filter === 'PENDING_LINK') rows = rows.filter((r) => r.accountLinkStatus === 'LINK_PENDING');
    else if (filter === 'ACTIVE') rows = rows.filter((r) => r.stayStatus === 'ACTIVE' || r.stayStatus === 'NOTICE');
    else if (filter === 'MOVED_OUT') rows = rows.filter((r) => r.stayStatus === 'LEFT');

    if (search) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(search) ||
          (r.phone || '').includes(search) ||
          (r.email || '').toLowerCase().includes(search) ||
          r.propertyName.toLowerCase().includes(search) ||
          r.organizationName.toLowerCase().includes(search)
      );
    }

    return res.json({ students: rows });
  } catch (err) {
    console.error('GET /api/admin/students error:', err);
    return res.status(500).json({ error: 'Failed to load student overview' });
  }
});

adminRouter.get('/enquiries', async (_req: AuthRequest, res) => {
  try {
    const [orgs, props, rows] = await Promise.all([
      db.select({ id: schema.organizations.id, name: schema.organizations.name }).from(schema.organizations),
      db.select({ id: schema.properties.id, name: schema.properties.name, city: schema.properties.city }).from(schema.properties),
      db.select().from(schema.enquiries).orderBy(desc(schema.enquiries.createdAt)),
    ]);

    const orgMap = new Map(orgs.map((o) => [o.id, o.name]));
    const propMap = new Map(props.map((p) => [p.id, p]));

    return res.json({
      enquiries: rows.map((e) => ({
        id: e.id,
        name: e.name,
        phone: e.phone,
        email: e.email,
        propertyName: propMap.get(e.propertyId)?.name || '',
        city: propMap.get(e.propertyId)?.city || '',
        organizationName: orgMap.get(e.organizationId) || '',
        preferredRoomType: e.preferredRoomType,
        moveInDate: e.moveInDate,
        message: e.message,
        status: e.status,
        createdAt: e.createdAt,
      })),
    });
  } catch (err) {
    console.error('GET /api/admin/enquiries error:', err);
    return res.status(500).json({ error: 'Failed to load enquiries' });
  }
});

adminRouter.get('/audit-logs', async (_req: AuthRequest, res) => {
  try {
    const logs = await db
      .select()
      .from(schema.auditLogs)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(100);
    return res.json({
      auditLogs: logs.map((l) => ({
        id: l.id,
        actorName: l.actorName,
        actorRole: l.actorRole,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        metadata: l.metadata,
        createdAt: l.createdAt,
      })),
    });
  } catch (err) {
    console.error('GET /api/admin/audit-logs error:', err);
    return res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

adminRouter.post('/bootstrap-lock', async (req: AuthRequest, res) => {
  try {
    const adminUser = req.user!;
    const platformOrg = await ensurePlatformOrg();
    await db.insert(schema.auditLogs).values({
      organizationId: platformOrg.id,
      actorUserId: adminUser.id,
      actorName: adminUser.name,
      actorRole: 'ADMIN',
      action: 'ADMIN_BOOTSTRAP_LOCKED',
      entityType: 'PLATFORM_SECURITY',
      entityId: String(adminUser.id),
      metadata: { email: adminUser.email },
    });
    return res.json({ ok: true, bootstrapStatus: await getAdminBootstrapStatus() });
  } catch (err) {
    console.error('POST /api/admin/bootstrap-lock error:', err);
    return res.status(500).json({ error: 'Failed to lock bootstrap' });
  }
});
