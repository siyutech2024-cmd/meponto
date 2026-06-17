import { requirePermission } from "../../../lib/server/authz";
import { jsonResponse } from "../../../lib/server/memory";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

/**
 * Product image upload → Supabase Storage (public bucket). Receives a compressed
 * image data URL from the supplier workspace and returns a public URL, so the
 * image no longer has to live inline in the product record. The endpoint is
 * best-effort: on ANY failure (missing keys, bucket/RLS issues, network) it
 * returns { url: null } and the client keeps the inline data URL — uploads never
 * regress.
 */

const BUCKET = "mall-products";
let bucketEnsured = false;

export async function POST(request: Request) {
  const forbidden = requirePermission(request, "manage_supplier_catalog");
  if (forbidden) return forbidden;

  const { dataUrl } = (await request.json().catch(() => ({}))) as { dataUrl?: string };
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
    const path = `products/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

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
