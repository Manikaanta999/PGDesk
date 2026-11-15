import { Router } from 'express';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import { ensureSeeded } from '../../db/seed.ts';
import { checkRateLimit, isDemoModeEnabled } from '../../lib/security.ts';
import { PLATFORM_ORG_SLUG } from '../../lib/platformAuth.ts';
import { publicEnquirySchema } from '../../lib/validation.ts';

export const publicRouter = Router();

publicRouter.get('/properties', async (_req, res) => {
  try {
    await ensureSeeded();
    const demoEnabled = isDemoModeEnabled();
    const rawProps = await db
      .select({
        property: schema.properties,
        orgSlug: schema.organizations.slug,
      })
      .from(schema.properties)
      .innerJoin(schema.organizations, eq(schema.properties.organizationId, schema.organizations.id))
      .where(
        demoEnabled
          ? and(
              eq(schema.properties.isPublic, true),
              isNull(schema.properties.deletedAt),
              ne(schema.organizations.slug, PLATFORM_ORG_SLUG)
            )
          : and(
              eq(schema.properties.isPublic, true),
              isNull(schema.properties.deletedAt),
              ne(schema.organizations.slug, PLATFORM_ORG_SLUG),
              ne(schema.organizations.slug, 'sharma-residency')
            )
      );
    const props = rawProps.map((r) => r.property);

    const allRooms = await db.select().from(schema.rooms);
    const allBeds = await db.select().from(schema.beds);

    const payload = props.map((p) => {
      const pRooms = allRooms.filter((r) => r.propertyId === p.id);
      const pBeds = allBeds.filter((b) => b.propertyId === p.id);
      const vacantBeds = pBeds.filter((b) => b.status === 'VACANT').length;
      const rents = pRooms.map((r) => r.rentPerBed);
      const minRent = rents.length ? Math.min(...rents) : 0;
      const maxRent = rents.length ? Math.max(...rents) : 0;

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        address: p.address,
        locality: p.locality,
        city: p.city,
        genderType: p.genderType,
        amenities: p.amenities,
        photos: p.photos,
        description: p.description,
        totalBeds: pBeds.length,
        vacantBeds,
        minRent,
        maxRent,
      };
    });

    return res.json({ properties: payload });
  } catch (err) {
    console.error('GET /api/public/properties error:', err);
    return res.status(500).json({ error: 'Failed to load public listings' });
  }
});

publicRouter.get('/properties/:slug', async (req, res) => {
  try {
    await ensureSeeded();
    const [prop] = await db
      .select()
      .from(schema.properties)
      .where(
        and(
          eq(schema.properties.slug, req.params.slug),
          eq(schema.properties.isPublic, true),
          isNull(schema.properties.deletedAt)
        )
      )
      .limit(1);

    if (!prop) {
      return res.status(404).json({ error: 'Property listing not found' });
    }

    const [org] = await db
      .select({
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        phone: schema.organizations.phone,
        brandColor: schema.organizations.brandColor,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, prop.organizationId))
      .limit(1);

    if (!isDemoModeEnabled() && org?.slug === 'sharma-residency') {
      return res.status(404).json({ error: 'Property listing not found' });
    }

    const pRooms = await db
      .select()
      .from(schema.rooms)
      .where(eq(schema.rooms.propertyId, prop.id));
    const pBeds = await db
      .select()
      .from(schema.beds)
      .where(eq(schema.beds.propertyId, prop.id));

    const roomTypesMap = new Map<string, { roomType: string; minRent: number; vacantBeds: number; totalBeds: number; acAvailable: boolean }>();
    for (const r of pRooms) {
      const rBeds = pBeds.filter((b) => b.roomId === r.id);
      const rVacant = rBeds.filter((b) => b.status === 'VACANT').length;
      const existing = roomTypesMap.get(r.roomType);
      if (!existing) {
        roomTypesMap.set(r.roomType, {
          roomType: r.roomType,
          minRent: r.rentPerBed,
          vacantBeds: rVacant,
          totalBeds: rBeds.length,
          acAvailable: r.isAc,
        });
      } else {
        existing.minRent = Math.min(existing.minRent, r.rentPerBed);
        existing.vacantBeds += rVacant;
        existing.totalBeds += rBeds.length;
        existing.acAvailable = existing.acAvailable || r.isAc;
      }
    }

    const rents = pRooms.map((r) => r.rentPerBed);
    return res.json({
      property: {
        id: prop.id,
        name: prop.name,
        slug: prop.slug,
        address: prop.address,
        locality: prop.locality,
        city: prop.city,
        genderType: prop.genderType,
        amenities: prop.amenities,
        photos: prop.photos,
        rules: prop.rules,
        contactName: prop.contactName,
        contactPhone: prop.contactPhone,
        description: prop.description,
        totalBeds: pBeds.length,
        vacantBeds: pBeds.filter((b) => b.status === 'VACANT').length,
        minRent: rents.length ? Math.min(...rents) : 0,
        maxRent: rents.length ? Math.max(...rents) : 0,
        roomSummary: Array.from(roomTypesMap.values()),
      },
      organization: org || null,
      appUrl: (process.env.APP_URL || '').replace(/\/$/, ''),
    });
  } catch (err) {
    console.error('GET /api/public/properties/:slug error:', err);
    return res.status(500).json({ error: 'Failed to load property details' });
  }
});

publicRouter.post('/enquiries', async (req, res) => {
  try {
    await ensureSeeded();
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`enquiry:${ip}`, 10, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many enquiries submitted. Please try again shortly.' });
    }

    const parsed = publicEnquirySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid enquiry data' });
    }

    const [prop] = await db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.id, parsed.data.propertyId), isNull(schema.properties.deletedAt)))
      .limit(1);

    if (!prop) {
      return res.status(404).json({ error: 'Selected property was not found' });
    }

    const digits = (parsed.data.phone || '').replace(/\D/g, '');
    const normalizedPhone =
      digits.length === 12 && digits.startsWith('91')
        ? digits.slice(2)
        : digits.length >= 10
          ? digits.slice(-10)
          : '';

    const [enquiry] = await db
      .insert(schema.enquiries)
      .values({
        organizationId: prop.organizationId,
        propertyId: prop.id,
        name: parsed.data.name,
        phone: normalizedPhone || null,
        email: parsed.data.email ? parsed.data.email.trim().toLowerCase() : null,
        preferredRoomType: parsed.data.preferredRoomType,
        moveInDate: parsed.data.moveInDate || null,
        message: parsed.data.message,
        status: 'NEW_ENQUIRY',
        source: 'PUBLIC_LISTING',
      })
      .returning();

    return res.status(201).json({
      enquiry: { id: enquiry.id, status: enquiry.status },
      message: 'Enquiry received! Our property manager will reach out on WhatsApp/call shortly.',
    });
  } catch (err) {
    console.error('POST /api/public/enquiries error:', err);
    return res.status(500).json({ error: 'Failed to submit enquiry' });
  }
});
