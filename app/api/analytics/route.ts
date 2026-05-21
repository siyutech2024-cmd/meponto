import { getNetworkMetrics, getPontoRiskRows, getRiderRiskRows } from "../../lib/analytics";
import { jsonResponse, memory } from "../../lib/server/memory";

export function GET() {
  return jsonResponse({
    data: {
      metrics: getNetworkMetrics(memory.riders, memory.incidents),
      riderRisk: getRiderRiskRows(memory.riders, memory.incidents),
      pontoRisk: getPontoRiskRows(memory.riders, memory.incidents),
    },
  });
}
