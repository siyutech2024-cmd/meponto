import { clearSessionCookie } from "../../../lib/auth-session";
import { jsonResponse } from "../../../lib/server/memory";

export async function POST(request: Request) {
  const response = jsonResponse({ status: "logged_out" });
  response.headers.append("Set-Cookie", clearSessionCookie(request.headers.get("host")));
  return response;
}
