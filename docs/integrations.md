# PontoSys Integration Provider Skeletons

The MVP exposes typed integration readiness only. It does not make external calls, verify credentials with vendors, enqueue jobs, or send messages. Readiness is based on required environment variables being present and non-empty.

## Endpoint

### `GET /api/integrations`

Returns provider metadata, required environment variables, missing variables, configured variable names, and a status summary.

Status values:

| Status | Meaning |
| --- | --- |
| `ready` | All required environment variables for the provider are present. |
| `missing_env` | One or more required environment variables are absent or empty. |
| `demo_only` | Reserved for future providers that are intentionally demo-mode even when configured. |

Example response:

```json
{
  "data": [
    {
      "id": "whatsapp",
      "label": "WhatsApp",
      "demoProvider": "Meta WhatsApp Cloud API Demo",
      "requiredEnv": ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"],
      "optionalEnv": ["WHATSAPP_APP_SECRET", "WHATSAPP_BUSINESS_ACCOUNT_ID"],
      "status": "missing_env",
      "missingEnv": ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"],
      "configuredEnv": []
    }
  ],
  "summary": {
    "ready": 0,
    "missing_env": 5,
    "demo_only": 0
  }
}
```

## Providers

| Capability | Demo provider | Required environment variables | Optional environment variables |
| --- | --- | --- | --- |
| WhatsApp | Meta WhatsApp Cloud API Demo | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` | `WHATSAPP_APP_SECRET`, `WHATSAPP_BUSINESS_ACCOUNT_ID` |
| Maps | Google Maps Platform Demo | `MAPS_API_KEY` | `MAPS_MAP_ID` |
| Object Storage | S3-Compatible Storage Demo | `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY` | `OBJECT_STORAGE_ENDPOINT` |
| PIX / Payout | Brazil PSP PIX Payout Demo | `PIX_PAYOUT_API_KEY`, `PIX_PAYOUT_ACCOUNT_ID`, `PIX_PAYOUT_WEBHOOK_SECRET` | `PIX_PAYOUT_BASE_URL` |
| SMS / Email | Twilio SendGrid Messaging Demo | `SMS_PROVIDER_API_KEY`, `SMS_FROM_NUMBER`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM_ADDRESS` | `EMAIL_REPLY_TO_ADDRESS` |

## Implementation Notes

- Provider definitions live in `app/lib/integrations.ts`.
- The route handler lives at `app/api/integrations/route.ts`.
- The readiness check only inspects `process.env`; secrets are never returned, only environment variable names.
- Production adapters should be added behind these typed provider IDs with real credential validation, audit logging, retries, and idempotency controls.
