import { getTerritoryPayload } from "../../lib/territory";
import { jsonResponse } from "../../lib/server/memory";

export function GET() {
  return jsonResponse({ data: getTerritoryPayload() });
}
