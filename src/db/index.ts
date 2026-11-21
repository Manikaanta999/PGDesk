import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { parseDatabaseUrl } from './connection.ts';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const databaseUrl = parseDatabaseUrl();
    const poolConfig = databaseUrl
      ? {
          connectionString: databaseUrl.toString(),
          ssl: { rejectUnauthorized: true },
        }
      : {
          host: process.env.SQL_HOST,
          user: process.env.SQL_USER || process.env.SQL_ADMIN_USER,
          password: process.env.SQL_PASSWORD || process.env.SQL_ADMIN_PASSWORD,
          database: process.env.SQL_DB_NAME,
          ssl: false,
        };

    if (!databaseUrl && (!poolConfig.host || !poolConfig.user || !poolConfig.password || !poolConfig.database)) {
      throw new Error(
        'Database configuration is missing. Set DATABASE_URL or SQL_HOST, SQL_DB_NAME, and SQL_USER/SQL_PASSWORD.',
      );
    }

    global._postgresPool = new Pool({
      ...poolConfig,
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();
export const db = drizzle(pool, { schema });
export { schema };
