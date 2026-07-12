import { jsonResponse, memory } from "../../../lib/server/memory";
import { refreshCollectionsFromDatabase } from "../../../lib/server/persistence";

export async function GET() {
  // Read-through refresh: this is the rider app's (guest + logged-in) catalog
  // source — without it a warm instance kept serving its boot-time snapshot,
  // so new products / stock changes made on another instance never surfaced.
  await refreshCollectionsFromDatabase(["marketplaceProducts"]);
  return jsonResponse({ data: memory.marketplaceProducts.filter((product) => product.status === "active") });
}
