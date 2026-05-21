import { jsonResponse } from "../../../lib/server/memory";

type LoginBody = {
  phone?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as LoginBody;

  if (!body.phone || !body.password) {
    return jsonResponse({ error: "phone and password are required" }, { status: 400 });
  }

  return jsonResponse({
    status: "authenticated",
    token: "demo-pontosys-token",
    user: {
      id: "usr-demo-dispatch",
      phone: body.phone,
      role: "Super Admin",
      region: "Sao Paulo Core Network",
    },
  });
}
