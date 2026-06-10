# MePonto PontoSys / PontoMall MVP

MePonto PontoSys is the Sao Paulo operations system for the control console, franchise workflows, rider system, Pontos, Leaders, incident response, night shift safety, rewards, notifications, SOP execution, and audit visibility.

PontoMall is the mall system for points redemption, catalog, stock reserve, and order fulfillment.

The UI supports English, Chinese, and Portuguese through the language selector in the app header and login screen.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Formal Systems

- PontoSys main backend: `/pontosys`
- Franchise backend: `/franchise-admin`
- Ponto station backend: `/ponto-admin`
- MePonto rider app: `/app`
- PontoMall: `/pontomall`
- Partner service point: `/partner-app`
- Supplier backend: `/supplier-admin`
- T+1 / KPI / quota / whitelist core: `/operations-core`

Test accounts are shown on `/login` and documented in `docs/formal-system-deployment.md`.

## Main Routes

- `/login`
- `/reset-password`
- `/pontosys`
- `/franchise-admin`
- `/ponto-admin`
- `/app`
- `/pontomall`
- `/partner-app`
- `/supplier-admin`
- `/operations-core`
- `/dashboard`
- `/riders`
- `/rider-app`
- `/pontos`
- `/territory`
- `/leaders`
- `/mobile`
- `/incidents`
- `/rewards`
- `/finance`
- `/crm`
- `/whatsapp`
- `/night-shift`
- `/analytics`
- `/reports`
- `/realtime`
- `/tools`
- `/audit`
- `/access-control`
- `/security`
- `/settings`

## Deployment

The current Vercel deployment can use path-based system entries first. Production host routing supports `sys.meponto.com`, `franchise.meponto.com`, `station.meponto.com`, `app.meponto.com`, `partner.meponto.com`, `supplier.meponto.com`, and `mall.meponto.com`. See `docs/pontosys-prd-v2-architecture.md`.

## Docker

```bash
npm run docker:up
npm run docker:down
```

The Compose stack includes the Next.js application, PostgreSQL 16, and Redis 7.

## API Routes

- `POST /api/auth/login`
- `POST /api/auth/reset-password`
- `GET /api/health`
- `GET, POST /api/riders`
- `PUT, DELETE /api/riders/:id`
- `GET, POST /api/pontos`
- `PUT /api/pontos/:id`
- `GET /api/territory`
- `GET, POST /api/leaders`
- `PUT /api/leaders/:id`
- `GET /api/mobile`
- `GET, POST /api/incidents`
- `PUT /api/incidents/:id`
- `GET, POST /api/rewards`
- `GET, POST /api/finance`
- `PUT /api/finance/:id`
- `GET, POST /api/crm`
- `GET, POST /api/whatsapp`
- `GET /api/analytics`
- `GET /api/reports`
- `GET /api/realtime`
- `GET, POST /api/tools/export`
- `GET /api/audit`
- `GET /api/access-control`
- `GET /api/security`
- `GET, POST /api/settings`

The API currently uses in-memory demo data. The frontend uses persisted browser state for fast MVP interaction.
