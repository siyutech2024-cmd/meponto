import { jsonResponse } from "../../lib/server/memory";
import { persistenceStatus } from "../../lib/server/persistence";

export function GET() {
  return jsonResponse({ ok: true, service: "pontosys-api", persistence: persistenceStatus() });
}
