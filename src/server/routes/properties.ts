import { Router } from 'express';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import { checkPlanBedLimit, checkPlanPropertyLimit } from '../../lib/billing.ts';
import {
  addRoomBedsSchema,
  createFloorSchema,
  createPropertySchema,
  createRoomSchema,
  updateBedStatusSchema,
} from '../../lib/validation.ts';
import {
  AuthRequest,
  canAccessProperty,
  getAllowedPropertyIds,
  requireAuth,
  requireRole,
} from '../../middleware/auth.ts';
import { floorBelongsToProperty } from './authorization.ts';
import { logAudit } from '../audit.ts';

export const propertiesRouter = Router();

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

propertiesRouter.get('/', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const orgProps = await db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.organizationId, user.organizationId), isNull(schema.properties.deletedAt)))
      .orderBy(asc(schema.properties.id));

    const allowedIds = new Set(getAllowedPropertyIds(user, orgProps.map((p) => p.id)));
    const visibleProps = orgProps.filter((p) => allowedIds.has(p.id));
    if (visibleProps.length === 0) {
      return res.json({ properties: [] });
    }

    const allBeds = await db
      .select()
      .from(schema.beds)
      .where(
        and(
          eq(schema.beds.organizationId, user.organizationId),
          inArray(schema.beds.propertyId, [...allowedIds])
        )
      );
    const allRooms = await db
      .select()
      .from(schema.rooms)
      .where(
        and(
          eq(schema.rooms.organizationId, user.organizationId),
          inArray(schema.rooms.propertyId, [...allowedIds])
        )
      );

    const enriched = visibleProps.map((p) => {
      const pBeds = allBeds.filter((b) => b.propertyId === p.id);
      const pRooms = allRooms.filter((r) => r.propertyId === p.id);
      return {
        ...p,
        stats: {
          totalRooms: pRooms.length,
          totalBeds: pBeds.length,
          occupiedBeds: pBeds.filter((b) => b.status === 'OCCUPIED').length,
          vacantBeds: pBeds.filter((b) => b.status === 'VACANT').length,
          reservedBeds: pBeds.filter((b) => b.status === 'RESERVED').length,
          maintenanceBeds: pBeds.filter((b) => b.status === 'MAINTENANCE').length,
        },
      };
    });

    return res.json({ properties: enriched });
  } catch (err) {
    console.error('GET /api/properties error:', err);
    return res.status(500).json({ error: 'Failed to load properties' });
  }
});

propertiesRouter.post('/', requireAuth, requireRole('OWNER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const parsed = createPropertySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid property data' });
    }

    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.organizationId))
      .limit(1);
    const [propCountRow] = await db
      .select({ total: count() })
      .from(schema.properties)
      .where(and(eq(schema.properties.organizationId, user.organizationId), isNull(schema.properties.deletedAt)));

    const propLimit = checkPlanPropertyLimit({
      planTier: org?.planTier,
      currentProperties: propCountRow?.total ?? 0,
    });
    if (!propLimit.allowed) {
      return res.status(403).json({ error: propLimit.message });
    }

    const baseSlug = slugify(parsed.data.name) || 'pg-property';
    const slug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

    const [created] = await db
      .insert(schema.properties)
      .values({
        organizationId: user.organizationId,
        name: parsed.data.name,
        slug,
        address: parsed.data.address,
        locality: parsed.data.locality,
        city: parsed.data.city,
        genderType: parsed.data.genderType,
        amenities: parsed.data.amenities,
        rules: parsed.data.rules,
        photos: parsed.data.photos.length
          ? parsed.data.photos
          : ['/src/assets/images/hero_pg_coliving_1794584162558.jpg'],
        contactName: parsed.data.contactName,
        contactPhone: parsed.data.contactPhone.replace(/\D/g, '').slice(-10),
        description: parsed.data.description,
        isPublic: parsed.data.isPublic,
        billingMode: parsed.data.billingMode,
        billingDay: parsed.data.billingDay,
      })
      .returning();

    // Auto-create Ground/1st Floor so the bed-map is immediately usable
    await db.insert(schema.floors).values({
      organizationId: user.organizationId,
      propertyId: created.id,
      name: '1st Floor',
      floorNumber: 1,
    });

    await logAudit({
      user,
      action: 'PROPERTY_CREATED',
      entityType: 'PROPERTY',
      entityId: created.id,
      metadata: { name: created.name },
    });

    return res.status(201).json({ property: created });
  } catch (err) {
    console.error('POST /api/properties error:', err);
    return res.status(500).json({ error: 'Failed to create property' });
  }
});

propertiesRouter.patch('/:id', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const propId = Number(req.params.id);
    if (!canAccessProperty(user, propId)) {
      return res.status(403).json({ error: 'Access denied to this property' });
    }

    const parsed = createPropertySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update payload' });
    }

    const updatePayload: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date(),
    };
    if (parsed.data.contactPhone) {
      updatePayload.contactPhone = parsed.data.contactPhone.replace(/\D/g, '').slice(-10);
    }

    const [updated] = await db
      .update(schema.properties)
      .set(updatePayload)
      .where(
        and(
          eq(schema.properties.id, propId),
          eq(schema.properties.organizationId, user.organizationId),
          isNull(schema.properties.deletedAt)
        )
      )
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Property not found' });
    }

    await logAudit({
      user,
      action: 'PROPERTY_UPDATED',
      entityType: 'PROPERTY',
      entityId: updated.id,
      metadata: { name: updated.name },
    });

    return res.json({ property: updated });
  } catch (err) {
    console.error('PATCH /api/properties/:id error:', err);
    return res.status(500).json({ error: 'Failed to update property' });
  }
});

propertiesRouter.delete('/:id', requireAuth, requireRole('OWNER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const propId = Number(req.params.id);

    const activeTenants = await db
      .select()
      .from(schema.tenants)
      .where(
        and(
          eq(schema.tenants.organizationId, user.organizationId),
          eq(schema.tenants.propertyId, propId),
          eq(schema.tenants.status, 'ACTIVE'),
          isNull(schema.tenants.deletedAt)
        )
      );

    if (activeTenants.length > 0) {
      return res.status(409).json({
        error: `Cannot delete property with ${activeTenants.length} active residents. Move out residents first.`,
      });
    }

    const [deleted] = await db
      .update(schema.properties)
      .set({ deletedAt: new Date(), isPublic: false, updatedAt: new Date() })
      .where(and(eq(schema.properties.id, propId), eq(schema.properties.organizationId, user.organizationId)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Property not found' });
    }

    await logAudit({
      user,
      action: 'PROPERTY_DELETED',
      entityType: 'PROPERTY',
      entityId: propId,
      metadata: { name: deleted.name },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/properties/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete property' });
  }
});

propertiesRouter.get('/:id/bed-map', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const propId = Number(req.params.id);
    if (!canAccessProperty(user, propId)) {
      return res.status(403).json({ error: 'Access denied to this property' });
    }

    const [prop] = await db
      .select()
      .from(schema.properties)
      .where(
        and(
          eq(schema.properties.id, propId),
          eq(schema.properties.organizationId, user.organizationId),
          isNull(schema.properties.deletedAt)
        )
      )
      .limit(1);

    if (!prop) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const [propFloors, propRooms, propBeds, propTenants] = await Promise.all([
      db
        .select()
        .from(schema.floors)
        .where(and(eq(schema.floors.propertyId, propId), eq(schema.floors.organizationId, user.organizationId)))
        .orderBy(asc(schema.floors.floorNumber)),
      db
        .select()
        .from(schema.rooms)
        .where(and(eq(schema.rooms.propertyId, propId), eq(schema.rooms.organizationId, user.organizationId)))
        .orderBy(asc(schema.rooms.roomNumber)),
      db
        .select()
        .from(schema.beds)
        .where(and(eq(schema.beds.propertyId, propId), eq(schema.beds.organizationId, user.organizationId)))
        .orderBy(asc(schema.beds.bedLabel)),
      db
        .select()
        .from(schema.tenants)
        .where(
          and(
            eq(schema.tenants.propertyId, propId),
            eq(schema.tenants.organizationId, user.organizationId),
            isNull(schema.tenants.deletedAt)
          )
        ),
    ]);

    const activeTenantByBed = new Map<number, typeof propTenants[number]>();
    for (const t of propTenants) {
      if (t.bedId && (t.status === 'ACTIVE' || t.status === 'NOTICE')) {
        activeTenantByBed.set(t.bedId, t);
      }
    }

    const floorsWithRooms = propFloors.map((floor) => {
      const floorRooms = propRooms
        .filter((r) => r.floorId === floor.id)
        .map((room) => {
          const roomBeds = propBeds
            .filter((b) => b.roomId === room.id)
            .map((bed) => {
              const t = activeTenantByBed.get(bed.id);
              return {
                ...bed,
                effectiveRent: bed.monthlyRentOverride ?? room.rentPerBed,
                tenant: t
                  ? {
                      id: t.id,
                      name: t.name,
                      phone: t.phone,
                      status: t.status,
                      monthlyRent: t.monthlyRent,
                      joinDate: t.joinDate,
                      leaveDate: t.leaveDate,
                    }
                  : null,
              };
            });
          return { ...room, beds: roomBeds };
        });
      return { ...floor, rooms: floorRooms };
    });

    return res.json({ property: prop, floors: floorsWithRooms });
  } catch (err) {
    console.error('GET /api/properties/:id/bed-map error:', err);
    return res.status(500).json({ error: 'Failed to load bed map' });
  }
});

propertiesRouter.post('/:id/floors', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const propId = Number(req.params.id);
    if (!canAccessProperty(user, propId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const parsed = createFloorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid floor data' });
    }

    const [created] = await db
      .insert(schema.floors)
      .values({
        organizationId: user.organizationId,
        propertyId: propId,
        name: parsed.data.name,
        floorNumber: parsed.data.floorNumber,
      })
      .returning();

    return res.status(201).json({ floor: created });
  } catch (err) {
    console.error('POST /api/properties/:id/floors error:', err);
    return res.status(500).json({ error: 'Failed to add floor' });
  }
});

propertiesRouter.post('/:id/rooms', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const propId = Number(req.params.id);
    if (!canAccessProperty(user, propId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid room data' });
    }

    const [floor] = await db
      .select()
      .from(schema.floors)
      .where(
        and(
          eq(schema.floors.id, parsed.data.floorId),
          eq(schema.floors.propertyId, propId),
          eq(schema.floors.organizationId, user.organizationId)
        )
      )
      .limit(1);
    if (!floorBelongsToProperty(floor, user.organizationId, propId)) {
      return res.status(404).json({ error: 'Selected floor not found in this property' });
    }

    const defaultBedCount =
      parsed.data.bedCount ??
      (parsed.data.roomType === 'SINGLE'
        ? 1
        : parsed.data.roomType === 'DOUBLE'
          ? 2
          : parsed.data.roomType === 'TRIPLE'
            ? 3
            : 4);

    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.organizationId))
      .limit(1);
    const [bedCountRow] = await db
      .select({ total: count() })
      .from(schema.beds)
      .where(eq(schema.beds.organizationId, user.organizationId));

    const bedLimit = checkPlanBedLimit({
      planTier: org?.planTier,
      currentBeds: bedCountRow?.total ?? 0,
      bedsToAdd: defaultBedCount,
    });
    if (!bedLimit.allowed) {
      return res.status(403).json({ error: bedLimit.message });
    }

    const [room] = await db
      .insert(schema.rooms)
      .values({
        organizationId: user.organizationId,
        propertyId: propId,
        floorId: parsed.data.floorId,
        roomNumber: parsed.data.roomNumber,
        roomType: parsed.data.roomType,
        isAc: parsed.data.isAc,
        attachedBath: parsed.data.attachedBath,
        rentPerBed: parsed.data.rentPerBed,
      })
      .returning();

    const bedLabels = Array.from({ length: defaultBedCount }, (_, i) =>
      `${parsed.data.roomNumber}-${String.fromCharCode(65 + i)}`
    );

    const createdBeds = await db
      .insert(schema.beds)
      .values(
        bedLabels.map((bedLabel) => ({
          organizationId: user.organizationId,
          propertyId: propId,
          floorId: parsed.data.floorId,
          roomId: room.id,
          bedLabel,
          status: 'VACANT' as const,
        }))
      )
      .returning();

    return res.status(201).json({ room, beds: createdBeds });
  } catch (err) {
    console.error('POST /api/properties/:id/rooms error:', err);
    return res.status(500).json({ error: 'Failed to add room and beds' });
  }
});

propertiesRouter.post('/rooms/:roomId/beds', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const roomId = Number(req.params.roomId);
    const parsed = addRoomBedsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid bed count' });
    }

    const [room] = await db
      .select()
      .from(schema.rooms)
      .where(and(eq(schema.rooms.id, roomId), eq(schema.rooms.organizationId, user.organizationId)))
      .limit(1);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    if (!canAccessProperty(user, room.propertyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.organizationId))
      .limit(1);
    const [bedCountRow] = await db
      .select({ total: count() })
      .from(schema.beds)
      .where(eq(schema.beds.organizationId, user.organizationId));

    const bedLimit = checkPlanBedLimit({
      planTier: org?.planTier,
      currentBeds: bedCountRow?.total ?? 0,
      bedsToAdd: parsed.data.count,
    });
    if (!bedLimit.allowed) {
      return res.status(403).json({ error: bedLimit.message });
    }

    const existingBeds = await db
      .select()
      .from(schema.beds)
      .where(and(eq(schema.beds.roomId, room.id), eq(schema.beds.organizationId, user.organizationId)));
    const usedLabels = new Set(existingBeds.map((b) => b.bedLabel));

    const newLabels: string[] = [];
    let idx = 0;
    while (newLabels.length < parsed.data.count && idx < 52) {
      const suffix = idx < 26 ? String.fromCharCode(65 + idx) : `${Math.floor(idx / 26)}${String.fromCharCode(65 + (idx % 26))}`;
      const candidate = `${room.roomNumber}-${suffix}`;
      if (!usedLabels.has(candidate)) {
        usedLabels.add(candidate);
        newLabels.push(candidate);
      }
      idx++;
    }

    const createdBeds = await db
      .insert(schema.beds)
      .values(
        newLabels.map((bedLabel) => ({
          organizationId: user.organizationId,
          propertyId: room.propertyId,
          floorId: room.floorId,
          roomId: room.id,
          bedLabel,
          status: 'VACANT' as const,
          monthlyRentOverride: parsed.data.monthlyRentOverride ?? null,
        }))
      )
      .returning();

    return res.status(201).json({ beds: createdBeds });
  } catch (err) {
    console.error('POST /api/properties/rooms/:roomId/beds error:', err);
    return res.status(500).json({ error: 'Failed to add beds to room' });
  }
});

propertiesRouter.patch('/beds/:bedId', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const bedId = Number(req.params.bedId);
    const parsed = updateBedStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid bed update' });
    }

    const [existing] = await db
      .select()
      .from(schema.beds)
      .where(and(eq(schema.beds.id, bedId), eq(schema.beds.organizationId, user.organizationId)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Bed not found' });
    }
    if (!canAccessProperty(user, existing.propertyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (parsed.data.status !== 'OCCUPIED') {
      const activeResidents = await db
        .select({ id: schema.tenants.id, name: schema.tenants.name })
        .from(schema.tenants)
        .where(
          and(
            eq(schema.tenants.bedId, bedId),
            eq(schema.tenants.organizationId, user.organizationId),
            inArray(schema.tenants.status, ['ACTIVE', 'NOTICE']),
            isNull(schema.tenants.deletedAt)
          )
        )
        .limit(1);

      if (activeResidents[0]) {
        return res.status(409).json({
          error: `Bed is currently assigned to ${activeResidents[0].name}. Complete move-out settlement from the student profile to release this bed.`,
        });
      }
    }

    const [updated] = await db
      .update(schema.beds)
      .set({
        status: parsed.data.status,
        notes: parsed.data.notes !== undefined ? parsed.data.notes : existing.notes,
        monthlyRentOverride:
          parsed.data.monthlyRentOverride !== undefined
            ? parsed.data.monthlyRentOverride
            : existing.monthlyRentOverride,
        updatedAt: new Date(),
      })
      .where(eq(schema.beds.id, bedId))
      .returning();

    return res.json({ bed: updated });
  } catch (err) {
    console.error('PATCH /api/properties/beds/:bedId error:', err);
    return res.status(500).json({ error: 'Failed to update bed' });
  }
});
