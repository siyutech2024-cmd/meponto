import { getSecurityPosture } from "../../lib/security";
import { jsonResponse } from "../../lib/server/memory";

export function GET() {
  return jsonResponse({
    data: getSecurityPosture(),
  });
}
