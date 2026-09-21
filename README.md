# Rocher Mutuel Financial

> A modern financial institution built from Monaco, for an increasingly international world.

Rocher Mutuel Financial is an institutional and investor prototype for a Monaco-based financial services group.

## Status

**Prototype foundation — active development**

This repository contains the application foundation and will evolve toward an institutional website, investor experience, administration layer, and financial-services backend.

Any financial figures used in prototype materials are illustrative assumptions, not verified financial results.

## Technology

- Node.js 20+
- TypeScript
- Express
- PostgreSQL / Neon
- Prisma
- GitHub
- Environment-based configuration

## Local development

```bash
npm install
cp .env.example .env
# Add your Neon DATABASE_URL
npm run dev
```

Health check:

```
GET /health
```

## Principles

- Relationship-led financial services
- International accessibility
- Security-first engineering
- Auditable financial records
- Clear separation between prototype data and real financial data
- Portable infrastructure with no vendor lock-in

## Security

Secrets must remain in environment variables. Never commit database credentials, API keys, private certificates, customer data, or production secrets.

## Roadmap

- [x] Application foundation
- [ ] Institutional public website
- [ ] Investor experience
- [ ] PostgreSQL schema
- [ ] Authentication foundation
- [ ] Administration API
- [ ] Audit logging
- [ ] Financial ledger foundation
- [ ] Deployment automation
- [ ] Monitoring and backups
