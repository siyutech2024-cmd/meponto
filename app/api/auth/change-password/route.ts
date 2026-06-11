import { createHash, randomBytes } from "node:crypto";
import { appendServerAudit, jsonResponse, memory } from "../../../lib/server/memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "../../../lib/server/persistence";
import { sessionFromRequest } from "../../../lib/auth-session";

const hash = (salt: string, password: string) => createHash("sha256").update(`${salt}:${password}`).digest("hex");

/** Self-service password change for any logged-in portal account. */
export async function POST(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ error: "请先登录" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { currentPassword?: string; newPassword?: string };
  if (!body.currentPassword || !body.newPassword || body.newPassword.length < 6) {
    return jsonResponse({ error: "请填写当前密码和至少 6 位的新密码" }, { status: 400 });
  }

  await refreshCollectionsFromDatabase(["appUsers"]);
  const index = memory.appUsers.findIndex((user) => user.identifier === session.identifier);
  if (index === -1) {
    return jsonResponse({ error: "该账号不支持自助改密（演示账号请联系总部）" }, { status: 404 });
  }

  const user = memory.appUsers[index];
  if (hash(user.salt, body.currentPassword) !== user.passwordHash) {
    return jsonResponse({ error: "当前密码不正确" }, { status: 403 });
  }

  const salt = randomBytes(8).toString("hex");
  memory.appUsers[index] = { ...user, salt, passwordHash: hash(salt, body.newPassword) };
  appendServerAudit({ actor: session.role, action: "USER_PASSWORD_SELF_CHANGED", entity: "AppUser", entityId: user.id, detail: `${user.identifier} changed own password.`, risk: "Medium" });

  await flushPendingToDatabase();
  return jsonResponse({ data: { ok: true } });
}
