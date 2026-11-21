# Database migrations

`bun run db:generate` generates migrations from `src/db/schema.ts` without database credentials or a database connection.

`bun run db:migrate` explicitly applies pending migrations using `DATABASE_URL` when set, or the legacy SQL admin settings required by `src/db/drizzle.config.ts`. URL-based PostgreSQL connections use SSL with certificate verification.

The initial `0000_baseline.sql` migration is for a completely fresh PostgreSQL database only. Do not run it against an initialized database that has no Drizzle migration history. This repository does not automatically adopt or baseline existing databases; use a separately reviewed migration-history procedure before applying migrations to any existing database. Do not use `drizzle-kit push` as a substitute for migration history.
