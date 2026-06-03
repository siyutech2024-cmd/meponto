import { jsonResponse } from "../../lib/server/memory";
import { getProductionConfigStatus } from "../../lib/server/production-config";

export function GET() {
  return jsonResponse({
    ok: true,
    service: "pontosys-api",
    production: getProductionConfigStatus(),
  });
}
