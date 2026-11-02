import { jsonResponse } from "../../lib/server/memory";
import { persistenceStatus } from "../../lib/server/persistence";
import { smsHealthSnapshot } from "../../lib/server/sms-health";

export function GET() {
  // `sms` = OTP channel health (last success/failure, package usage) so the
  // warmup ping and any uptime monitor can see a dead SMS channel at a glance.
  return jsonResponse({ ok: true, service: "pontosys-api", persistence: persistenceStatus(), sms: smsHealthSnapshot() });
}
