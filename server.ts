import cookieParser from 'cookie-parser';
import 'dotenv/config';
import { and, eq, isNull, ne } from 'drizzle-orm';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db, schema } from './src/db/index.ts';
import { ensureSeeded } from './src/db/seed.ts';
import { PLATFORM_ORG_SLUG } from './src/lib/platformAuth.ts';
import { isDemoModeEnabled } from './src/lib/security.ts';
import { ensureAdminBootstrapped } from './src/server/adminBootstrap.ts';
import { accountRouter } from './src/server/routes/account.ts';
import { adminRouter } from './src/server/routes/admin.ts';
import { authRouter } from './src/server/routes/auth.ts';
import { billingRouter } from './src/server/routes/billing.ts';
import { cronRouter } from './src/server/routes/cron.ts';
import { dashboardRouter } from './src/server/routes/dashboard.ts';
import { operationsRouter } from './src/server/routes/operations.ts';
import { propertiesRouter } from './src/server/routes/properties.ts';
import { publicRouter } from './src/server/routes/public.ts';
import { tenantPortalRouter } from './src/server/routes/tenantPortal.ts';
import { tenantsRouter } from './src/server/routes/tenants.ts';

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  const PORT = 3000;

  app.use(express.json({ limit: '8mb' }));
  app.use(cookieParser());

  // Serve generated PG property imagery cleanly in both dev & prod (allow Vite ?import module requests through)
  const assetsImagesDir = path.resolve(process.cwd(), 'src/assets/images');
  if (fs.existsSync(assetsImagesDir)) {
    const staticAssets = express.static(assetsImagesDir);
    app.use('/src/assets/images', (req, res, next) => {
      if ('import' in req.query || 'raw' in req.query) {
        return next();
      }
      return staticAssets(req, res, next);
    });
  }

  // API routes
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'pgdesk' });
  });

  void ensureSeeded().catch((err) => {
    console.error('Demo seed failed:', err);
  });

  let bootstrapError: unknown = null;
  const bootstrapPromise = ensureAdminBootstrapped().catch((err) => {
    bootstrapError = err;
    console.error('Admin bootstrap failed; API requests will remain unavailable:', err);
  });

  app.use('/api', async (_req, res, next) => {
    await bootstrapPromise;
    if (bootstrapError) {
      return res.status(503).json({ error: 'Database initialization failed. Check server logs.' });
    }
    return next();
  });

  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/account', accountRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/properties', propertiesRouter);
  app.use('/api/tenants', tenantsRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/tenant', tenantPortalRouter);
  app.use('/api/cron', cronRouter);
  app.use('/api', operationsRouter);

  // SEO sitemap.xml & robots.txt for public landing and PG listings
  app.get('/sitemap.xml', async (req, res) => {
    try {
      await ensureSeeded();
      const baseUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const demoEnabled = isDemoModeEnabled();
      const props = await db
        .select({ slug: schema.properties.slug, updatedAt: schema.properties.updatedAt })
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

      const urls = [
        `<url><loc>${baseUrl}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
        ...props.map(
          (p) =>
            `<url><loc>${baseUrl}/pg/${p.slug}</loc><lastmod>${p.updatedAt.toISOString().slice(0, 10)}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>`
        ),
      ];

      res.setHeader('Content-Type', 'application/xml');
      res.send(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`
      );
    } catch (err) {
      console.error('Sitemap generation failed:', err);
      res.status(500).send('');
    }
  });

  app.get('/robots.txt', (req, res) => {
    const baseUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    res.type('text/plain');
    res.send(`User-agent: *\nAllow: /\nAllow: /pg/\nDisallow: /dashboard\nDisallow: /tenant\nDisallow: /admin\nSitemap: ${baseUrl}/sitemap.xml\n`);
  });

  // Vite middleware in dev, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PGDesk server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
