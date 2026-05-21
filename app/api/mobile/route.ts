import { getMobilePayload } from "../../lib/mobile";
import { jsonResponse } from "../../lib/server/memory";

export function GET() {
  return jsonResponse({ data: getMobilePayload() });
}
