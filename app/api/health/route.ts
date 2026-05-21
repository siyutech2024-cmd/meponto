import { jsonResponse } from "../../lib/server/memory";

export function GET() {
  return jsonResponse({ ok: true, service: "pontosys-api" });
}
