import { getIntegrationReadiness, summarizeIntegrationReadiness } from "../../lib/integrations";
import { jsonResponse } from "../../lib/server/memory";

export function GET() {
  const data = getIntegrationReadiness();

  return jsonResponse({
    data,
    summary: summarizeIntegrationReadiness(data),
  });
}
