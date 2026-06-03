import { jsonResponse, memory } from "../../../lib/server/memory";

export function GET() {
  return jsonResponse({ data: memory.marketplaceProducts.filter((product) => product.status === "active") });
}
