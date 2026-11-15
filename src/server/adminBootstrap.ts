import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { db, schema } from '../db/index.ts';
import { ADMIN_PRIMARY_EMAIL, PLATFORM_ORG_SLUG } from '../lib/platformAuth.ts';
import { hashPassword } from '../lib/security.ts';

export async function ensurePlatformOrg() {
  const existing = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, PLATFORM_ORG_SLUG))
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  const [created] = await db
    .insert(schema.organizations)
    .values({
      name: 'PGDesk Platform',
      slug: PLATFORM_ORG_SLUG,
      upiId: 'platform@pgdesk',
      upiPayeeName: 'PGDesk Platform',
      planTier: 'ENTERPRISE',
      phone: '',
      email: ADMIN_PRIMARY_EMAIL,
      address: 'Platform Administration',
    })
    .returning();

  return created;
}

export async function isAdminBootstrapLocked(): Promise<boolean> {
  if (process.env.ADMIN_BOOTSTRAP_ENABLED?.trim().toLowerCase() === 'false') {
    return true;
  }
  const rows = await db
    .select({ id: schema.auditLogs.id })
    .from(schema.auditLogs)
    .where(eq(schema.auditLogs.action, 'ADMIN_BOOTSTRAP_LOCKED'))
    .limit(1);
  return Boolean(rows[0]);
}

let bootstrapPromise: Promise<void> | null = null;

export function ensureAdminBootstrapped(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = runAdminBootstrap();
  }
  return bootstrapPromise;
}

async function runAdminBootstrap(): Promise<void> {
  let adminPool: Pool | null = null;
  try {
    const runtimeRole = process.env.SQL_USER || process.env.SQL_ADMIN_USER;
    if (!runtimeRole) {
      throw new Error('SQL_USER or SQL_ADMIN_USER must be configured');
    }
    const adminRole = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
    adminPool = new Pool({
      host: process.env.SQL_HOST,
      user: adminRole,
      password: process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 1,
      connectionTimeoutMillis: 15000,
    });
    const adminDb = drizzle(adminPool, { schema });
    console.log(`[SchemaSync] Running migrations as ${adminRole}; runtime role is ${runtimeRole}.`);

    const migrationStatements = [
      sql`DO $$ BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ADMIN'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      sql`DO $$ BEGIN CREATE TYPE owner_token_status AS ENUM ('UNUSED', 'USED', 'EXPIRED', 'REVOKED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      sql`DO $$ BEGIN CREATE TYPE account_link_status AS ENUM ('NO_ACCOUNT', 'ACCOUNT_CREATED', 'LINK_PENDING', 'LINKED', 'LINK_REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      sql`DO $$ BEGIN ALTER TYPE enquiry_status ADD VALUE IF NOT EXISTS 'NEW_ENQUIRY'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      sql`DO $$ BEGIN ALTER TYPE enquiry_status ADD VALUE IF NOT EXISTS 'CONTACTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      sql`DO $$ BEGIN ALTER TYPE enquiry_status ADD VALUE IF NOT EXISTS 'APPROVED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      sql`DO $$ BEGIN ALTER TYPE enquiry_status ADD VALUE IF NOT EXISTS 'REJECTED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      sql`DO $$ BEGIN ALTER TYPE enquiry_status ADD VALUE IF NOT EXISTS 'CONVERTED_TO_STUDENT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS uid text;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url text;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token_hash text;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at timestamp;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 1;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamp;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{"hostelNotices":true,"rentReminders":true,"complaintUpdates":true,"securityAlerts":true}'::jsonb;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email text;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email_code_hash text;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email_expires_at timestamp;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_phone text;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_phone_code_hash text;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_phone_expires_at timestamp;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code_hash text;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires_at timestamp;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash text;`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at timestamp;`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS users_uid_unique ON users (uid);`,
      sql`CREATE INDEX IF NOT EXISTS users_phone_idx ON users (phone);`,
      sql`CREATE TABLE IF NOT EXISTS owner_registration_tokens (
        id serial PRIMARY KEY,
        token_hash text NOT NULL,
        token_last4 text NOT NULL,
        note text NOT NULL DEFAULT '',
        status owner_token_status NOT NULL DEFAULT 'UNUSED',
        expires_at timestamp NOT NULL,
        created_by_user_id integer REFERENCES users(id),
        used_by_user_id integer REFERENCES users(id),
        used_by_organization_id integer REFERENCES organizations(id),
        used_at timestamp,
        revoked_by_user_id integer REFERENCES users(id),
        revoked_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      );`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS owner_reg_tokens_hash_idx ON owner_registration_tokens (token_hash);`,
      sql`CREATE INDEX IF NOT EXISTS owner_reg_tokens_status_idx ON owner_registration_tokens (status);`,
      sql`CREATE TABLE IF NOT EXISTS user_sessions (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id),
        session_id text NOT NULL,
        user_agent text NOT NULL DEFAULT 'Web Browser',
        ip_address text NOT NULL DEFAULT '',
        created_at timestamp NOT NULL DEFAULT now(),
        last_seen_at timestamp NOT NULL DEFAULT now(),
        revoked_at timestamp
      );`,
      sql`CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id);`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_sid_idx ON user_sessions (session_id);`,
      sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS account_link_status account_link_status NOT NULL DEFAULT 'NO_ACCOUNT';`,
      sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS link_code_hash text;`,
      sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS link_code_expires_at timestamp;`,
      sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS link_requested_by_user_id integer REFERENCES users(id);`,
      sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS link_requested_at timestamp;`,
      sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS linked_at timestamp;`,
      sql`UPDATE tenants SET account_link_status = 'LINKED', linked_at = COALESCE(linked_at, now()) WHERE user_id IS NOT NULL AND account_link_status = 'NO_ACCOUNT';`,
      sql`CREATE INDEX IF NOT EXISTS tenants_user_idx ON tenants (user_id);`,
      sql`CREATE INDEX IF NOT EXISTS tenants_link_status_idx ON tenants (account_link_status);`,
      sql`ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'PUBLIC_LISTING';`,
      sql`ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';`,
      sql`UPDATE enquiries SET status = 'NEW_ENQUIRY' WHERE status::text = 'NEW';`,
      sql`UPDATE enquiries SET status = 'CONVERTED_TO_STUDENT' WHERE status::text = 'CONVERTED';`,
      sql`ALTER TABLE enquiries ALTER COLUMN status SET DEFAULT 'NEW_ENQUIRY';`,
      sql`GRANT USAGE ON SCHEMA public TO ${sql.raw(quoteIdentifier(runtimeRole))};`,
      sql`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${sql.raw(quoteIdentifier(runtimeRole))};`,
      sql`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${sql.raw(quoteIdentifier(runtimeRole))};`,
      sql`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${sql.raw(
        quoteIdentifier(runtimeRole)
      )};`,
      sql`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${sql.raw(
        quoteIdentifier(runtimeRole)
      )};`,
    ];

    for (const [index, stmt] of migrationStatements.entries()) {
      try {
        await adminDb.execute(stmt);
      } catch (migrationErr) {
        const error = migrationErr as { message?: string; code?: string };
        console.error(`[SchemaSync] Statement ${index + 1}/${migrationStatements.length} failed as ${adminRole}:`, {
          message: error.message,
          code: error.code,
          error: migrationErr,
        });
      }
    }
    const platformOrg = await ensurePlatformOrg();
    const locked = await isAdminBootstrapLocked();
    if (locked) {
      return;
    }

    const initialPassword = process.env.INITIAL_ADMIN_PASSWORD?.trim();
    if (!initialPassword || initialPassword.length < 8) {
      return;
    }

    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, ADMIN_PRIMARY_EMAIL))
      .limit(1);

    if (!existing[0]) {
      const [adminUser] = await db
        .insert(schema.users)
        .values({
          organizationId: platformOrg.id,
          name: 'Platform Administrator',
          email: ADMIN_PRIMARY_EMAIL,
          phone: null,
          passwordHash: hashPassword(initialPassword),
          role: 'ADMIN',
          assignedPropertyIds: [],
          isActive: true,
          emailVerified: true,
          phoneVerified: false,
        })
        .returning();

      await db.insert(schema.auditLogs).values({
        organizationId: platformOrg.id,
        actorUserId: adminUser.id,
        actorName: adminUser.name,
        actorRole: 'ADMIN',
        action: 'ADMIN_BOOTSTRAPPED',
        entityType: 'USER',
        entityId: String(adminUser.id),
        metadata: { email: ADMIN_PRIMARY_EMAIL },
      });
      return;
    }

    if (existing[0].role !== 'ADMIN' || !existing[0].passwordHash) {
      await db
        .update(schema.users)
        .set({
          organizationId: platformOrg.id,
          role: 'ADMIN',
          assignedPropertyIds: [],
          passwordHash: hashPassword(initialPassword),
          emailVerified: true,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, existing[0].id));

      await db.insert(schema.auditLogs).values({
        organizationId: platformOrg.id,
        actorUserId: existing[0].id,
        actorName: existing[0].name,
        actorRole: 'ADMIN',
        action: 'ADMIN_BOOTSTRAPPED',
        entityType: 'USER',
        entityId: String(existing[0].id),
        metadata: { email: ADMIN_PRIMARY_EMAIL, promotedFromRole: existing[0].role },
      });
    }
  } catch (err) {
    const error = err as { message?: string; code?: string };
    console.error('Admin bootstrap check failed; continuing so the server can start:', {
      message: error.message,
      code: error.code,
      error: err,
    });
  } finally {
    if (adminPool) {
      await adminPool.end().catch((err) => {
        console.error('Failed to close admin bootstrap pool:', err);
      });
    }
  }
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(identifier)) {
    throw new Error('SQL_USER must be a valid PostgreSQL role name');
  }
  return `"${identifier}"`;
}

export async function getAdminBootstrapStatus() {
  const [adminUserRows, locked] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        isActive: schema.users.isActive,
        lastLoginAt: schema.users.lastLoginAt,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(and(eq(schema.users.email, ADMIN_PRIMARY_EMAIL), eq(schema.users.role, 'ADMIN')))
      .limit(1),
    isAdminBootstrapLocked(),
  ]);

  const adminUser = adminUserRows[0] || null;
  return {
    adminEmail: ADMIN_PRIMARY_EMAIL,
    adminExists: Boolean(adminUser),
    adminActive: Boolean(adminUser?.isActive),
    lastLoginAt: adminUser?.lastLoginAt || null,
    bootstrapEnabled: process.env.ADMIN_BOOTSTRAP_ENABLED?.trim().toLowerCase() !== 'false',
    bootstrapLocked: locked,
    hasEnvPasswordConfigured: Boolean(
      process.env.INITIAL_ADMIN_PASSWORD && process.env.INITIAL_ADMIN_PASSWORD.trim().length >= 8
    ),
  };
}
