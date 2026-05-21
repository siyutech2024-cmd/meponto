import { buildExportDefinitions, createImportJob, operationHistory, type ImportJobInput } from "../../../lib/importExport";
import { jsonResponse, memory } from "../../../lib/server/memory";
import { requirePermission } from "../../../lib/server/authz";

export function GET() {
  return jsonResponse({
    exports: buildExportDefinitions(memory.riders, memory.incidents, memory.ledgerEntries),
    history: operationHistory,
  });
}

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "manage_riders");
  if (forbidden) return forbidden;

  const body = (await request.json()) as ImportJobInput;

  if (body.entity && body.entity !== "Riders") {
    return jsonResponse({ error: "Only Riders CSV imports are available in this demo" }, { status: 400 });
  }

  const job = createImportJob({ ...body, entity: "Riders" });
  return jsonResponse({ data: job }, { status: 201 });
}
