import { sessionFromRequest } from "../../../lib/auth-session";
import { portalConfigs } from "../../../lib/portals";
import { jsonResponse } from "../../../lib/server/memory";

export async function GET(request: Request) {
  const session = await sessionFromRequest(request);
  if (!session) return jsonResponse({ authenticated: false }, { status: 401 });

  return jsonResponse({
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
    },
  });
}

