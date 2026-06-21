import { appendServerAudit, jsonResponse, memory } from "../../../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../../../lib/server/persistence";
import { requirePermission, roleFromRequest } from "../../../../lib/server/authz";
import { defaultSplashConfig, type AppSplashRecord } from "../../../../lib/app-config";

/**
 * App launch (启动页) config — one endpoint shared by every rider client.
 *  - GET  : public; the rider app fetches this on each launch.
 *  - POST : HQ (view_audit) updates the splash; version bumps so clients refresh.
 */

const COLLECTIONS = ["appSplashConfigs"];
const nowStamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

function current(): AppSplashRecord {
  return memory.appSplashConfigs[0] ?? { id: "app-splash", ...defaultSplashConfig };
}

function publicView(record: AppSplashRecord) {
  // Native clients decode a fixed shape; return config fields only (no internal id).
  const { id: _id, ...config } = record;
  void _id;
  return config;
}

export async function GET() {
  await refreshCollectionsFromDatabase(COLLECTIONS);
  return jsonResponse({ data: publicView(current()) });
}

type Body = { action?: string } & Partial<AppSplashRecord>;

async function handlePost(request: Request) {
  const forbidden = requirePermission(request, "view_audit");
  if (forbidden) return forbidden;
  const actor = roleFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as Body;
  await refreshCollectionsFromDatabase(COLLECTIONS);

  const prev = current();
  const clampHex = (value: unknown, fallback: string) => {
    const s = String(value ?? "").trim();
    return /^#?[0-9a-fA-F]{6}$/.test(s) ? (s.startsWith("#") ? s : `#${s}`) : fallback;
  };
  const next: AppSplashRecord = {
    id: "app-splash",
    enabled: body.enabled !== undefined ? body.enabled === true : prev.enabled,
    headline: body.headline !== undefined ? String(body.headline).slice(0, 40) : prev.headline,
    tagline: body.tagline !== undefined ? String(body.tagline).slice(0, 120) : prev.tagline,
    durationMs: body.durationMs !== undefined ? Math.min(8000, Math.max(600, Math.floor(Number(body.durationMs) || prev.durationMs))) : prev.durationMs,
    backgroundHex: body.backgroundHex !== undefined ? clampHex(body.backgroundHex, prev.backgroundHex) : prev.backgroundHex,
    accentHex: body.accentHex !== undefined ? clampHex(body.accentHex, prev.accentHex) : prev.accentHex,
    imageURL: body.imageURL !== undefined ? String(body.imageURL).trim().slice(0, 500) : prev.imageURL,
    linkURL: body.linkURL !== undefined ? String(body.linkURL).trim().slice(0, 500) : prev.linkURL,
    version: (prev.version ?? 0) + 1,
    updatedAt: nowStamp(),
    updatedBy: actor,
  };
  if (memory.appSplashConfigs.length === 0) memory.appSplashConfigs.push(next);
  else memory.appSplashConfigs[0] = next;

  appendServerAudit({ actor, action: "APP_SPLASH_UPDATED", entity: "AppSplashConfig", entityId: "app-splash", detail: `v${next.version} · enabled=${next.enabled} · "${next.headline}"`, risk: "Low" });
  return jsonResponse({ data: publicView(next) });
}

export async function POST(request: Request) {
  const response = await handlePost(request);
  await flushPendingToDatabase();
  return response;
}
