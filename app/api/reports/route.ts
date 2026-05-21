import { getWarehouseSummary, reportCatalog } from "../../lib/reports";
import { jsonResponse } from "../../lib/server/memory";

export function GET() {
  return jsonResponse({
    data: {
      reportCatalog,
      warehouseSummary: getWarehouseSummary(),
    },
  });
}
