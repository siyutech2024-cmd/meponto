type Environment = NodeJS.ProcessEnv;

const supabaseVariables = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
] as const;

function isConfigured(value: string | undefined) {
  return Boolean(value?.trim());
}

export function getProductionConfigStatus(env: Environment = process.env) {
  const missingEnv = supabaseVariables.filter((name) => !isConfigured(env[name]));

  return {
    persistence: missingEnv.length === 0 ? "configured" : "demo_memory",
    supabase: {
      configured: missingEnv.length === 0,
      missingEnv,
    },
  };
}
