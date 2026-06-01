# meponto PontoSys MVP

meponto PontoSys is a Sao Paulo rider and Ponto operations dashboard. This MVP focuses on rider network control, Pontos, Leaders, incident response, night shift safety, rewards, notifications, SOP execution, and audit visibility.

The UI supports English, Chinese, and Portuguese through the language selector in the app header and login screen.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Main Routes

- `/login`
- `/reset-password`
- `/dashboard`
- `/riders`
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

## Production Configuration

The GitHub + Supabase + Vercel setup guide lives in
[`docs/deployment.md`](docs/deployment.md). Copy `.env.example` to
`.env.local` for local development and keep real secrets out of Git.
