import { Router } from 'express';
import { ne } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import { PLATFORM_ORG_SLUG } from '../../lib/platformAuth.ts';
import { verifyCronSecret } from '../../lib/security.ts';
import { runBillingCycleForOrg } from '../billingEngine.ts';

export const cronRouter = Router();

function getTodayISTYMD(): { asOfDate: string; year: number; month: number } {
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const year = nowIst.getUTCFullYear();
  const month = nowIst.getUTCMonth() + 1;
  const day = nowIst.getUTCDate();
  return {
    asOfDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    year,
    month,
  };
}

cronRouter.post('/daily-billing', async (req, res) => {
  try {
    if (!verifyCronSecret(req.headers.authorization)) {
      return res.status(401).json({ error: 'Unauthorized cron invocation' });
    }

    const fallback = getTodayISTYMD();
    const rawDate = typeof req.body?.asOfDate === 'string' ? req.body.asOfDate.trim() : '';
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);
    const asOfDate = dateMatch ? rawDate : fallback.asOfDate;
    const year = dateMatch ? Number(dateMatch[1]) : fallback.year;
    const month = dateMatch ? Number(dateMatch[2]) : fallback.month;

    const orgs = await db
      .select()
      .from(schema.organizations)
      .where(ne(schema.organizations.slug, PLATFORM_ORG_SLUG));
    let invoicesCreated = 0;
    let overdueUpdated = 0;

    for (const org of orgs) {
      const result = await runBillingCycleForOrg({
        org,
        year,
        month,
        asOfDate,
        applyLateFees: true,
        respectBillingDay: true,
      });
      invoicesCreated += result.createdCount;
      overdueUpdated += result.updatedOverdueCount;

      if (result.createdCount > 0 || result.updatedOverdueCount > 0) {
        await db.insert(schema.auditLogs).values({
          organizationId: org.id,
          actorUserId: null,
          actorName: 'Automated Billing Cron',
          actorRole: 'SYSTEM',
          action: 'CRON_DAILY_BILLING',
          entityType: 'INVOICE_BATCH',
          entityId: asOfDate,
          metadata: {
            createdCount: result.createdCount,
            updatedOverdueCount: result.updatedOverdueCount,
          },
        });
      }
    }

    return res.json({
      ok: true,
      asOfDate,
      orgsProcessed: orgs.length,
      invoicesCreated,
      overdueUpdated,
    });
  } catch (err) {
    console.error('POST /api/cron/daily-billing error:', err);
    return res.status(500).json({ error: 'Cron billing run failed' });
  }
});
