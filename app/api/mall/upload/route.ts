import { requirePermission } from "../../../lib/server/authz";
import { jsonResponse } from "../../../lib/server/memory";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

/**
 * Image upload → Supabase Storage (public bucket). Receives a compressed image
 * data URL and returns a public https URL. Callers:
 *   - supplier workspace product images (default, `manage_supplier_catalog`)
 *   - admin push-notification banners / splash images (`kind: "push" | "splash"`,
 *     gated by `view_audit` — the same permission the push composer needs).
 * Best-effort: on ANY failure (missing keys, bucket/RLS issues, network) it
 * returns { url: null } and the client keeps its previous value — uploads never
 * regress.
 */

const BUCKET = "mall-products";
let bucketEnsured = false;

export async function POST(request: Request) {
  const { dataUrl, kind } = (await request.json().catch(() => ({}))) as { dataUrl?: string; kind?: string };
  const isAdminMedia = kind === "push" || kind === "splash";
  const forbidden = requirePermission(request, isAdminMedia ? "view_audit" : "manage_supplier_catalog");
  if (forbidden) return forbidden;

  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    return jsonResponse({ url: null, error: "invalid image" });
  }

  try {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return jsonResponse({ url: null, error: "unsupported format" });
    const contentType = match[1];
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.byteLength > 4 * 1024 * 1024) return jsonResponse({ url: null, error: "too large" });
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const folder = isAdminMedia ? kind : "products";
    const path = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const supabase = getSupabaseServerClient();
    if (!bucketEnsured) {
      await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});
      bucketEnsured = true;
    }
    let result = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
    if (result.error) {
      // Bucket may not exist yet — create it and retry once.
      await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});
      result = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
    }
    if (result.error) return jsonResponse({ url: null, error: result.error.message });

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return jsonResponse({ url: data.publicUrl });
  } catch (error) {
    return jsonResponse({ url: null, error: (error as Error).message });
  }
}
