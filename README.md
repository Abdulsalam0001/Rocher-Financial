# Rocher Mutuel Financial

> A modern financial institution prototype with a controlled Node.js/Express backend, PostgreSQL database, Prisma data layer, customer banking experience, and administrative console.

## Project status

**Active development / production-oriented prototype**

The application is deployed as an Express application and uses PostgreSQL (currently intended for Neon) through Prisma. Financial figures and institutional content in the prototype are illustrative unless explicitly verified.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript |
| Backend | Express 5 |
| Database | PostgreSQL / Neon |
| ORM | Prisma 6 |
| Frontend | HTML, CSS, JavaScript |
| Security | Helmet, HttpOnly session cookie, HMAC-SHA256 sessions, scrypt password hashing |
| Source control | GitHub |
| Deployment | Render |
| Monitoring | UptimeRobot + `/health` |
| Backups | GitHub Actions + encrypted PostgreSQL dumps |

## Architecture

```text
Browser
   |
   v
Render Web Service
   |
   +--> Express / TypeScript API
   |       |
   |       +--> Authentication / sessions
   |       +--> Customer dashboard
   |       +--> Admin dashboard
   |       +--> Transactions / ledger
   |       +--> Audit + security events
   |
   +--> Prisma
           |
           v
      PostgreSQL / Neon

GitHub Actions
   |
   +--> pg_dump
   +--> AES-256 encrypted backup
   +--> GitHub Actions artifact
```

The browser does not connect directly to PostgreSQL. Database access is handled by the server through Prisma.

## Database connection

The current backend **is already wired to PostgreSQL through Prisma**.

The Prisma datasource uses:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

The application creates a Prisma client in `src/server.ts` and uses it for authentication, customers, accounts, transactions, ledger entries, audit logs, security events, beneficiaries, and administrative operations.

### Render database setup

The Render service needs:

```text
DATABASE_URL=<your Neon PostgreSQL connection string>
SESSION_SECRET=<long random secret>
NODE_ENV=production
```

Do not commit these values to GitHub.

## GitHub database backups

Backup workflow:

```text
.github/workflows/database-backup.yml
```

The workflow:

1. Runs every day at **02:00 UTC**.
2. Can also be started manually from GitHub Actions.
3. Reads the production database from `DATABASE_URL`.
4. Runs `pg_dump` in PostgreSQL custom format.
5. Encrypts the dump with **AES-256** using `BACKUP_PASSPHRASE`.
6. Uploads the encrypted file as a GitHub Actions artifact.
7. Keeps the artifact for **30 days**.

### Required GitHub Actions secrets

Go to:

**GitHub → Repository → Settings → Secrets and variables → Actions**

Create:

```text
DATABASE_URL
BACKUP_PASSPHRASE
```

`BACKUP_PASSPHRASE` is the password required to decrypt a backup. Store it securely outside GitHub as well. If it is lost, the encrypted backup cannot be restored.

### Run a backup manually

1. Open the repository on GitHub.
2. Open **Actions**.
3. Select **Rocher Database Backup**.
4. Click **Run workflow**.
5. Wait for the workflow to complete successfully.
6. Open the completed workflow run.
7. Scroll to **Artifacts**.
8. Download the `rocher-database-backup-<run-id>` artifact.

The artifact is a ZIP containing the encrypted PostgreSQL dump.

### Restore a backup

Download the artifact and extract it locally.

Set the passphrase in your terminal:

```bash
export BACKUP_PASSPHRASE='your-backup-passphrase'
```

Decrypt the dump:

```bash
gpg --batch --yes --pinentry-mode loopback \
  --passphrase "$BACKUP_PASSPHRASE" \
  --output rocher-restore.dump \
  --decrypt rocher-*.dump.gpg
```

Then restore it into a PostgreSQL database:

```bash
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --dbname "$DATABASE_URL" \
  rocher-restore.dump
```

**Important:** Do not run a restore against the live production database unless you deliberately intend to replace its data. For recovery testing, restore into a separate Neon database first.

### Verify a backup before relying on it

A backup is only useful if it can be restored.

Recommended procedure:

1. Download a recent GitHub artifact.
2. Decrypt it.
3. Restore it into a separate PostgreSQL/Neon database.
4. Run Prisma/application checks against the restored database.
5. Confirm users, accounts, balances, transactions, audit records, and other important tables exist.

## Render idle / health monitoring

The backend exposes:

```text
GET /health
```

Example:

```text
https://rocher-financial.onrender.com/health
```

The endpoint returns a lightweight JSON health response without requiring authentication.

For the Render free-tier deployment, an external uptime monitor can periodically request this endpoint so the service receives regular traffic.

### UptimeRobot

The current recommended monitor is:

```text
https://rocher-financial.onrender.com/health
```

Configure the monitor to check approximately every **5 minutes**.

This is a monitoring/warm-up workaround, not a guarantee of zero cold starts. Render plan behavior can change, so paid hosting should be considered if guaranteed availability is required.

## Deployment

The Render build process should generate Prisma Client before compiling:

```bash
npm install --include=dev && npx prisma generate && npm run build
```

The application starts with:

```bash
npm start
```

The package build script currently runs:

```bash
prisma generate && prisma db push && tsc
```

Keep database migrations/schema changes deliberate. Do not use production database resets.

## Authentication and security

Current security-related implementation includes:

- Customer login security challenge.
- Admin login without the customer challenge.
- Password hashing with Node.js `scrypt`.
- Signed HMAC-SHA256 session tokens.
- HttpOnly session cookies.
- Secure cookies in production.
- Role-separated customer/admin routes.
- Customer/admin password-change operations.
- Audit logging.
- Security-event logging.
- Helmet HTTP security headers.
- No-cache responses for sensitive customer dashboard data.

### Production secret requirement

The backend currently has a development fallback for `SESSION_SECRET`. For a real production deployment, always provide a strong random `SESSION_SECRET` through Render environment variables and remove reliance on the fallback before treating the system as a production financial service.

## Financial data model

The current Prisma schema includes:

- Users
- Customers
- Staff
- Accounts
- Account holders
- Transactions
- Ledger entries
- Loans
- Loan payments
- Investments
- Beneficiaries
- Transfer PINs
- Audit logs
- Security events
- Branches

Balances are stored as integer minor units (for example, cents) rather than floating-point monetary values.

Transactions and ledger entries preserve timestamps, references, statuses, currencies, descriptions, and metadata.

## Backdated transaction history

The admin balance adjustment endpoint supports an optional historical transaction timestamp.

This is intended for controlled migration/history-entry use. It changes the real account balance and creates a real transaction/ledger entry; it is **not** a disconnected fake history record.

Future-dated adjustments are rejected.

## Operational checklist

Before considering a deployment stable:

- [ ] `DATABASE_URL` configured on Render.
- [ ] Strong `SESSION_SECRET` configured.
- [ ] GitHub Actions `DATABASE_URL` secret configured.
- [ ] GitHub Actions `BACKUP_PASSPHRASE` configured.
- [ ] Manual backup tested.
- [ ] Backup artifact successfully downloaded.
- [ ] Backup successfully decrypted.
- [ ] Backup successfully restored into a test database.
- [ ] `/health` monitored.
- [ ] Render deployment verified.
- [ ] Customer login tested.
- [ ] Admin login tested.
- [ ] Customer balances tested.
- [ ] Transaction history tested.
- [ ] Admin balance adjustment tested.
- [ ] Audit/security logging checked.

## Repository structure

```text
.
├── .github/
│   └── workflows/
│       └── database-backup.yml
├── database/
│   └── seed.ts
├── prisma/
│   └── schema.prisma
├── public/
│   ├── admin/
│   ├── css/
│   ├── js/
│   ├── dashboard.html
│   ├── login.html
│   └── index.html
├── src/
│   └── server.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Principles

- Keep financial records auditable.
- Keep secrets outside source control.
- Prefer server-side authorization.
- Keep database access behind the backend.
- Back up before major database changes.
- Test restores, not just backup creation.
- Treat payment and financial integrations as controlled server-side operations.
- Keep prototype assumptions clearly separated from verified institutional claims.
