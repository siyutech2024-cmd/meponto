import { jsonResponse } from "../../../lib/server/memory";

type ResetPasswordBody = {
  phone?: string;
  code?: string;
  newPassword?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ResetPasswordBody;

  if (!body.phone) {
    return jsonResponse({ error: "phone is required" }, { status: 400 });
  }

  if (!body.code && !body.newPassword) {
    return jsonResponse({
      status: "code_sent",
      phone: body.phone,
      demoCode: "246810",
      message: "Demo verification code sent.",
    });
  }

  if (!body.code || !body.newPassword) {
    return jsonResponse({ error: "code and newPassword are required" }, { status: 400 });
  }

  if (body.newPassword.length < 6) {
    return jsonResponse({ error: "newPassword must be at least 6 characters" }, { status: 400 });
  }

  return jsonResponse({
    status: "password_reset",
    phone: body.phone,
    token: "demo-reset-token",
    message: "Demo password reset complete.",
  });
}
