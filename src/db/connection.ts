const SSL_CONNECTION_PARAMETERS = new Set(['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert']);

export function parseDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): URL | undefined {
  const connectionString = environment.DATABASE_URL?.trim();
  if (!connectionString) {
    return undefined;
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }

  if (
    !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
    !databaseUrl.hostname ||
    !databaseUrl.pathname.slice(1) ||
    !databaseUrl.username ||
    !databaseUrl.password
  ) {
    throw new Error('DATABASE_URL must include a PostgreSQL host, database, username, and password.');
  }

  try {
    decodeURIComponent(databaseUrl.username);
    decodeURIComponent(databaseUrl.password);
    decodeURIComponent(databaseUrl.pathname.slice(1));
  } catch {
    throw new Error('DATABASE_URL contains invalid percent-encoding.');
  }

  for (const parameter of [...databaseUrl.searchParams.keys()]) {
    if (SSL_CONNECTION_PARAMETERS.has(parameter.toLowerCase())) {
      databaseUrl.searchParams.delete(parameter);
    }
  }

  return databaseUrl;
}
