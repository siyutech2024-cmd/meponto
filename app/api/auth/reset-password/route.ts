import { jsonResponse } from "../../../lib/server/memory";
import { normalizeBrPhone } from "../../../lib/phone";

type ResetPasswordBody = {
  phone?: string;
  code?: string;
  newPassword?: string;
};

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => ({}))) as ResetPasswordBody;
  // Default to Brazil (+55): any real SMS sender wired here later must receive
  // the canonical number, and the echoed phone should match what was targeted.
  const body: ResetPasswordBody = { ...raw, phone: raw.phone ? normalizeBrPhone(raw.phone) : raw.phone };

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
