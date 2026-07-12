import { renewSessionToken, sessionCookie, sessionFromRequest, sessionNeedsRenewal } from "../../../lib/auth-session";
import { portalConfigs } from "../../../lib/portals";
import { jsonResponse } from "../../../lib/server/memory";

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ authenticated: false }, { status: 401 });

  const response = jsonResponse({
    authenticated: true,
    user: {
      id: session.userId,
      name: session.name,
      identifier: session.identifier,
      role: session.role,
      portal: session.portal,
      tenantId: session.tenantId,
      organization: session.organization,
      defaultPath: session.defaultPath,
      franchise: session.franchise ?? "",
      station: session.station ?? "",
      portalName: portalConfigs[session.portal].productName,
      // Progressive login: `verified:false` marks a Google guest who hasn't
      // confirmed phone + CPF yet (lets the storefront show a guest account +
      // an "activate" prompt instead of treating them as logged out).
      verified: session.verified !== false,
      email: session.email ?? "",
    },
  });

  // Rolling renewal: every client hits this endpoint on startup, so when the
  // (verified) session has less than half its TTL left we re-sign it with a
  // fresh expiry and set the cookie again — active users stay logged in until
  // they explicitly log out; only long inactivity lets the session lapse.
  if (sessionNeedsRenewal(session)) {
    const token = await renewSessionToken(session);
    response.headers.append("Set-Cookie", sessionCookie(token, request.headers.get("host")));
  }

  return response;
}
