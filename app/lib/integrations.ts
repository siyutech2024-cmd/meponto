export type IntegrationCategory = "whatsapp" | "maps" | "object_storage" | "pix_payout" | "sms_email";

export type IntegrationStatus = "ready" | "missing_env" | "demo_only";

export type IntegrationProvider = {
  id: IntegrationCategory;
  label: string;
  demoProvider: string;
  requiredEnv: readonly string[];
  optionalEnv?: readonly string[];
};

export type IntegrationReadiness = IntegrationProvider & {
  status: IntegrationStatus;
  missingEnv: string[];
  configuredEnv: string[];
};

export type IntegrationReadinessSummary = Record<IntegrationStatus, number>;

const integrationProviders = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    demoProvider: "Meta WhatsApp Cloud API Demo",
    requiredEnv: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN"],
    optionalEnv: ["WHATSAPP_APP_SECRET", "WHATSAPP_BUSINESS_ACCOUNT_ID"],
  },
  {
    id: "maps",
    label: "Maps",
    demoProvider: "Google Maps Platform Demo",
    requiredEnv: ["MAPS_API_KEY"],
    optionalEnv: ["MAPS_MAP_ID"],
  },
  {
    id: "object_storage",
    label: "Object Storage",
    demoProvider: "S3-Compatible Storage Demo",
    requiredEnv: ["OBJECT_STORAGE_BUCKET", "OBJECT_STORAGE_REGION", "OBJECT_STORAGE_ACCESS_KEY_ID", "OBJECT_STORAGE_SECRET_ACCESS_KEY"],
    optionalEnv: ["OBJECT_STORAGE_ENDPOINT"],
  },
  {
    id: "pix_payout",
    label: "PIX / Payout",
    demoProvider: "Brazil PSP PIX Payout Demo",
    requiredEnv: ["PIX_PAYOUT_API_KEY", "PIX_PAYOUT_ACCOUNT_ID", "PIX_PAYOUT_WEBHOOK_SECRET"],
    optionalEnv: ["PIX_PAYOUT_BASE_URL"],
  },
  {
    id: "sms_email",
    label: "SMS / Email",
    demoProvider: "Twilio SendGrid Messaging Demo",
    requiredEnv: ["SMS_PROVIDER_API_KEY", "SMS_FROM_NUMBER", "EMAIL_PROVIDER_API_KEY", "EMAIL_FROM_ADDRESS"],
    optionalEnv: ["EMAIL_REPLY_TO_ADDRESS"],
  },
] as const satisfies readonly IntegrationProvider[];

export const integrations = integrationProviders;

function isConfigured(value: string | undefined) {
  return Boolean(value?.trim());
}

export function getIntegrationReadiness(env: NodeJS.ProcessEnv = process.env): IntegrationReadiness[] {
  return integrations.map((provider) => {
    const missingEnv = provider.requiredEnv.filter((envName) => !isConfigured(env[envName]));
    const configuredEnv = provider.requiredEnv.filter((envName) => isConfigured(env[envName]));

    return {
      ...provider,
      status: missingEnv.length === 0 ? "ready" : "missing_env",
      missingEnv,
      configuredEnv,
    };
  });
}

export function summarizeIntegrationReadiness(readiness: IntegrationReadiness[]): IntegrationReadinessSummary {
  return readiness.reduce<IntegrationReadinessSummary>(
    (summary, provider) => {
      summary[provider.status] += 1;
      return summary;
    },
    { ready: 0, missing_env: 0, demo_only: 0 },
  );
}
