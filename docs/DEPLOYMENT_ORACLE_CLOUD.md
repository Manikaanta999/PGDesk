# PGDesk Docker deployment on Oracle Cloud ARM64

This deployment runs PGDesk and PostgreSQL as separate ARM64 containers. Nginx is the only service publishing host ports. PostgreSQL data and local uploads use separate named Docker volumes.

## Prerequisites

- Ubuntu 22.04 or newer on an Oracle Cloud Ampere A1 VM.
- Docker Engine with the Compose v2 plugin.
- A DNS A record for the application domain pointing to the VM.
- Oracle Cloud ingress rules and the VM firewall allow TCP 80 and 443 only. Do not open 3000 or 5432.
- A TLS certificate issued for the domain.

The Compose services explicitly target `linux/arm64`. Their base images have ARM64 variants. Docker itself is not installed or tested by this repository task.

## Configure the VM

Clone the repository and create a private environment file:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Set the domain, Firebase project ID, and database usernames. Generate separate database passwords and the cron secret with:

```bash
openssl rand -hex 32
```

Generate `SESSION_SECRET` as exactly 32 random bytes in canonical base64url form:

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'
```

Paste generated values into `.env.production`; do not commit it. The placeholder session secret is intentionally invalid for production. The application rejects it at startup.

The PostgreSQL administrator password is used by the one-off migration service. The app connects with the distinct `SQL_USER` and `SQL_PASSWORD` role. That app role is created by the PostgreSQL initialization SQL only when the named volume is first initialized. Changing these variables later does not change credentials in an existing volume.

The browser Firebase configuration is currently imported from the repository’s `firebase-applet-config.json`; the Docker build includes it because the frontend imports it. This is client configuration, not a Firebase service-account private key. Set `FIREBASE_PROJECT_ID` to the matching project. Restrict the Firebase browser API key in Firebase/Google Cloud settings. This task does not change the existing Firebase configuration mechanism.

## Obtain TLS certificates

Before starting Nginx, issue a certificate on the VM using Certbot standalone mode. Port 80 must be reachable and not already occupied:

```bash
sudo apt update
sudo apt install -y certbot
sudo certbot certonly --standalone --agree-tos \
  --email admin@example.com \
  -d pgdesk.example.com
```

Use the same domain and email values in `.env.production`. The Compose stack mounts `/etc/letsencrypt` read-only; certificate files are not copied into the image or repository. For standalone renewal, stop Nginx before renewal and start it again afterward.

## Initialize a completely fresh database

Validate Compose interpolation without printing the resolved configuration or secrets:

```bash
docker compose --env-file .env.production config --quiet
```

Start PostgreSQL and wait for its health check:

```bash
docker compose --env-file .env.production up -d db
docker compose --env-file .env.production ps
```

For a **completely fresh database only**, explicitly apply the generated Drizzle baseline:

```bash
docker compose --env-file .env.production run --rm migrate
```

The migration service is profile-gated and is not started by ordinary `docker compose up`. It runs with the PostgreSQL administrator credentials and exits after migration. The app container does not receive those administrator credentials.

Do not run the baseline against an existing database without Drizzle migration history. There is no automatic baseline adoption. Do not use `drizzle-kit push`, and do not remove the `postgres_data` volume to resolve a migration issue.

## Start PGDesk

Build and start the application and Nginx:

```bash
docker compose --env-file .env.production up -d --build app nginx
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs --tail=100 app nginx db
```

Open `https://<APP_DOMAIN>`. The app listens internally on port 3000; Nginx publishes only ports 80 and 443. PostgreSQL has no published host port and is reachable only from the app/migration network.

## Operations and persistence

- `postgres_data` stores PostgreSQL data; `pgdesk_uploads` stores local uploaded files.
- `docker compose down` stops the services but preserves both volumes. Never use `docker compose down -v` on a database with data you need.
- Back up PostgreSQL regularly with `pg_dump`, store backups outside the VM, and test restore procedures.
- The database health check uses `pg_isready`; the app health check uses `/api/health`; Nginx has a local-only health endpoint.
- Container health checks do not replace database backups, monitoring, log retention, or TLS renewal monitoring.

## Scope and known limitations

**Do not use this deployment as a public tenant-registration launch until the approved authentication repairs are complete.** This stack does not implement email-only verification, invitation-only tenant registration, organization-scoped staff-property assignment, or other application authorization changes. Those remain separate application tasks. The current mailer has configuration support, but not every authentication or notification flow is wired to send email; do not treat deployment configuration as proof of email verification delivery.

Local filesystem uploads are persisted in a Docker volume on one VM. They are not shared across multiple app hosts and require separate backup planning.
