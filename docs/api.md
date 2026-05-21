# meponto PontoSys MVP API Contract

Base path: `/api`

All responses are JSON. Most collection endpoints return `{ "data": ... }`. Write endpoints return `201` on create, `200` on update/delete, `400` for missing required fields, and `404` when an ID is not found. Server responses include `Cache-Control: no-store`.

Persistence note: current API handlers still use process-local memory, but `app/lib/server/repositories.ts` now provides a typed repository facade over those same collections. This is migration prep only; the public API contract and response behavior are unchanged until individual routes opt into the facade or a PostgreSQL-backed implementation replaces it.

## Health

### `GET /api/health`

Response:

```json
{
  "ok": true,
  "service": "pontosys-api"
}
```

## Riders

### `GET /api/riders`

CPF and PIX are masked by default. The preferred reveal flow is `GET /api/riders/:id/sensitive`. For compatibility, rider collection/detail reads still support `x-vento-reveal-sensitive: true` plus an `x-vento-role` with `manage_riders` or `view_finance`.

Response:

```json
{
  "data": [
    {
      "id": "r-1001",
      "name": "Carlos Mendes",
      "cpf": "***.***.***-10",
      "pix": "c***@meponto.br",
      "phone": "+55 11 98423-9911",
      "bairro": "Bela Vista",
      "ponto": "Ponto Paulista Garage",
      "leader": "Rafael Costa",
      "invitedBy": "Rafael Costa",
      "whatsappGroup": "meponto Paulista 01",
      "ar": 96,
      "status": "Active",
      "vehicleType": "Motorcycle",
      "brand": "Honda",
      "model": "CG 160",
      "rentalStatus": "Owned",
      "isMottu": false,
      "onlineHours": 178,
      "nightShiftCount": 14,
      "incidentCount": 1,
      "joinDate": "2025-12-02"
    }
  ]
}
```

### `POST /api/riders`

Required: `name`, `cpf`, `phone`.

```json
{
  "name": "Bruno Lima",
  "cpf": "111.222.333-44",
  "phone": "+55 11 90000-0000",
  "pix": "bruno.pix@example.com",
  "bairro": "Bela Vista",
  "ponto": "Ponto Paulista Garage",
  "leader": "Rafael Costa",
  "status": "Active"
}
```

### `PUT /api/riders/:id`

Partial update. Example:

```json
{
  "status": "Risk",
  "incidentCount": 2
}
```

### `DELETE /api/riders/:id`

Returns the removed rider in `{ "data": ... }`.

### `GET /api/riders/:id/sensitive`

Dedicated sensitive-field reveal endpoint. Requires an explicit `x-vento-role` header with either `manage_riders` or `view_finance`. Requests without the header, invalid roles, or roles without permission return `403` and append a server audit entry.

Response:

```json
{
  "data": {
    "id": "r-1001",
    "name": "Carlos Mendes",
    "cpf": "123.456.789-10",
    "pix": "carlos.pix@meponto.br"
  }
}
```

## Pontos

### `GET /api/pontos`

Returns ponto records with `id`, `name`, `bairro`, `ridersCount`, `nightShiftLevel`, `leader`, `safetyScore`, `lat`, and `lng`.

### `POST /api/pontos`

Required: `name`, `bairro`.

```json
{
  "name": "Ponto Centro Intake",
  "bairro": "Republica",
  "leader": "Camila Nunes",
  "ridersCount": 36,
  "nightShiftLevel": "Medium",
  "safetyScore": 70,
  "lat": -23.544,
  "lng": -46.642
}
```

### `PUT /api/pontos/:id`

Partial update. Example:

```json
{
  "leader": "Camila Nunes",
  "safetyScore": 78
}
```

## Leaders

### `GET /api/leaders`

Returns leader records with `id`, `name`, `phone`, `ponto`, `ridersCount`, `nightShiftCoverage`, `rating`, `level`, `joinDate`, and `incidents`.

### `POST /api/leaders`

Required: `name`, `phone`.

```json
{
  "name": "Camila Nunes",
  "phone": "+55 11 97610-3344",
  "ponto": "Ponto Centro Intake",
  "ridersCount": 18,
  "nightShiftCoverage": 39,
  "rating": 4.3,
  "level": "Senior"
}
```

### `PUT /api/leaders/:id`

Partial update. Example:

```json
{
  "nightShiftCoverage": 64,
  "incidents": 1
}
```

## Incidents

### `GET /api/incidents`

Returns incident records with `id`, `rider`, `ponto`, `severity`, `status`, `location`, `description`, `createdAt`, and `responder`.

### `POST /api/incidents`

Required: `rider`, `ponto`, `severity`.

```json
{
  "rider": "Felipe Rocha",
  "ponto": "Ponto Tatuape Norte",
  "severity": "Critical",
  "location": "Av. Celso Garcia, Tatuape",
  "description": "Night shift crash reported by Leader.",
  "responder": "Regional Manager SP-East"
}
```

### `PUT /api/incidents/:id`

Partial update. Example:

```json
{
  "status": "Closed",
  "responder": "Support Desk"
}
```

## Rewards

### `GET /api/rewards`

Returns reward rules with `id`, `ruleName`, `points`, and `type`.

### `POST /api/rewards`

Required: `ruleName`, numeric `points`, and `type` as `Rider` or `Leader`.

```json
{
  "ruleName": "High AR Weekly",
  "points": 55,
  "type": "Rider"
}
```

### `PUT /api/rewards/:id`

Updates an existing reward rule. Requires `manage_rewards`.

```json
{
  "ruleName": "Night Shift Completion",
  "points": 45,
  "type": "Rider"
}
```

### `DELETE /api/rewards/:id`

Deletes an existing reward rule. Requires `manage_rewards`.

## Finance Ledger

### `GET /api/finance`

Response includes ledger records and totals by status:

```json
{
  "data": [
    {
      "id": "led-001",
      "recipient": "Andre Santos",
      "recipientType": "Rider",
      "ledgerType": "Reward",
      "amount": 120,
      "status": "Paid",
      "notes": "Night shift completion bonus",
      "createdAt": "2026-05-14 10:20"
    }
  ],
  "totals": {
    "Pending": 80,
    "Approved": 260,
    "Paid": 120,
    "Rejected": 0
  }
}
```

### `POST /api/finance`

Required: `recipient`, `recipientType`, `ledgerType`, `amount`.

```json
{
  "recipient": "Rafael Costa",
  "recipientType": "Leader",
  "ledgerType": "Leader Commission",
  "amount": 260,
  "notes": "Weekly team coverage commission"
}
```

### `PUT /api/finance/:id`

Partial update. Example:

```json
{
  "status": "Paid"
}
```

## CRM Partners

### `GET /api/crm`

Returns partner records plus summary:

```json
{
  "data": [],
  "summary": {
    "byCategory": {
      "Repair Shop": 2
    },
    "byRisk": {
      "Low": 2
    },
    "monthlyVolume": 285,
    "vehiclesAvailable": 39
  }
}
```

### `POST /api/crm`

Required: `name`, `category`, `contactName`, `phone`.

```json
{
  "name": "Oficina Paulista 24h",
  "category": "Repair Shop",
  "contactName": "Marina Lopes",
  "phone": "+55 11 94402-8800",
  "bairro": "Bela Vista",
  "tier": "Preferred",
  "risk": "Low",
  "services": ["Tires", "Emergency repair"]
}
```

## WhatsApp Groups

### `GET /api/whatsapp`

Returns group coverage records.

### `POST /api/whatsapp`

Required: `name`, `leader`, `ponto`.

```json
{
  "name": "meponto Centro Intake",
  "bairro": "Republica",
  "ponto": "Ponto Centro Intake",
  "leader": "Camila Nunes",
  "leaderPhone": "+55 11 97610-3344",
  "ridersCount": 36,
  "activeToday": 18,
  "nightCoverage": 39,
  "riskStatus": "Risk",
  "coverageStatus": "Gap",
  "broadcastList": "New Rider Intake"
}
```

## Settings

### `GET /api/settings`

Returns settings plus counts by `Active`, `Draft`, and `Paused`.

### `POST /api/settings`

Required: `category`, `name`, `value`.

```json
{
  "category": "Incident SLA",
  "name": "Critical Incident First Response",
  "value": "10",
  "unit": "minutes",
  "status": "Active",
  "owner": "Support Desk",
  "description": "Maximum first-contact SLA for critical rider incidents."
}
```

## Analytics

### `GET /api/analytics`

Returns derived analytics:

```json
{
  "data": {
    "metrics": {
      "activeRiders": 3,
      "nightShiftRiders": 1,
      "openIncidents": 2,
      "criticalIncidents": 1,
      "avgAr": 87,
      "highRiskRiders": 1,
      "networkRiskScore": 48
    },
    "riderRisk": [],
    "pontoRisk": []
  }
}
```

## Access Control

### `GET /api/access-control`

Returns static roles, permission labels, and role-to-permission mappings:

```json
{
  "data": {
    "roles": ["Super Admin", "Regional Manager", "Ponto Manager", "Leader", "Finance", "Support"],
    "permissionLabels": {
      "manage_riders": "Manage riders"
    },
    "rolePermissions": {
      "Finance": ["view_dashboard", "manage_rewards", "view_finance", "view_analytics", "view_audit"]
    }
  }
}
```

## Security

### `GET /api/security`

Returns demo security posture with login audit, readiness checks, RBAC risk checks, and risk events.

## Audit

### `GET /api/audit`

Requires `view_audit`. Returns the bootstrap audit entry plus current process-local server audit entries such as forbidden permission attempts and rider sensitive-field reveal attempts. Production should persist these audit entries durably and filter them by actor scope and permission.
