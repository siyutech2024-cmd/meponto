import { memory } from "./memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "./persistence";
import type { SystemSetting } from "../settings";

/**
 * SMS channel health (短信通道健康) — the missing feedback loop behind the
 * 2026-10-31 outage: Aliyun's package ran dry (AMOUNT_NOT_ENOUGH) and the
 * Twilio fallback had been rejecting credentials (401) for weeks, so every
 * OTP failed for days and nobody knew until riders could not log in.
 *
 * What this does, with NO new collection (it lives in one systemSettings
 * record, id `sms-health`):
 *   - records every delivery outcome (provider, ok, reason);
 *   - on failure: raises ONE HQ notification per hour (deduped by reason),
 *     with the operator action spelled out (top up / fix credentials);
 *   - on recovery after failures: one "已恢复" notification;
 *   - counts sends since the current package was bought and warns at 80% /
 *     95% of its size — the early warning Aliyun's API does not offer for
 *     prepaid international packages.
 *
 * Package tracking is configured by env (changes rarely, on purchase):
 *   SMS_PACKAGE_SIZE=1000          条 in the package bought
 *   SMS_PACKAGE_SINCE=2026-11-02   purchase date — sends before it don't count
 * Unset = failure alerts only, no usage warnings.
 */

export type SmsOutcome = {
  provider: "aliyun" | "twilio" | "none";
  ok: boolean;
  /** Provider's own reason on failure, e.g. "AMOUNT_NOT_ENOUGH" or "401". */
  reason?: string;
};

export type SmsHealth = {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  consecutiveFailures: number;
  /** Sends counted since SMS_PACKAGE_SINCE (approximate across instances). */
  sentSincePackage: number;
  packageSince: string | null;
  packageSize: number | null;
  usagePct: number | null;
  /** Dedupe stamps for the notifications this module raised. */
  lastAlertAt: string | null;
  lastAlertReason: string | null;
  warned80: boolean;
  warned95: boolean;
};

const RECORD_ID = "sms-health";
const ALERT_INTERVAL_MS = 60 * 60 * 1000;

const EMPTY: SmsHealth = {
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailureReason: null,
  consecutiveFailures: 0,
  sentSincePackage: 0,
  packageSince: null,
  packageSize: null,
  usagePct: null,
  lastAlertAt: null,
  lastAlertReason: null,
  warned80: false,
  warned95: false,
};

const stamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");

function packageConfig(): { size: number | null; since: string | null } {
  const size = Number(process.env.SMS_PACKAGE_SIZE ?? "");
  const since = (process.env.SMS_PACKAGE_SINCE ?? "").trim() || null;
  return { size: Number.isFinite(size) && size > 0 ? Math.floor(size) : null, since };
}

function readHealth(): SmsHealth {
  const row = memory.systemSettings.find((setting) => setting.id === RECORD_ID);
  if (!row) return { ...EMPTY };
  try {
    return { ...EMPTY, ...(JSON.parse(row.value) as Partial<SmsHealth>) };
  } catch {
    return { ...EMPTY };
  }
}

function writeHealth(health: SmsHealth): void {
  const index = memory.systemSettings.findIndex((setting) => setting.id === RECORD_ID);
  const summary = health.lastFailureAt && (!health.lastSuccessAt || health.lastFailureAt > health.lastSuccessAt)
    ? `故障: ${health.lastFailureReason ?? "unknown"} (${health.lastFailureAt})`
    : `正常 (最近成功 ${health.lastSuccessAt ?? "—"})`;
  const row: SystemSetting = {
    id: RECORD_ID,
    category: "Notification",
    name: "短信通道状态 (auto)",
    value: JSON.stringify(health),
    unit: "json",
    status: "Active",
    owner: "System",
    updatedAt: stamp(),
    description: `由系统自动维护,勿手工编辑。${summary}；本套餐已发 ${health.sentSincePackage}${health.packageSize ? ` / ${health.packageSize}` : ""} 条。`,
  };
  if (index === -1) memory.systemSettings.push(row);
  else memory.systemSettings[index] = row;
}

function notifyHq(id: string, title: string, body: string, severity: "Medium" | "High" | "Critical"): void {
  memory.notifications.unshift({
    id,
    title,
    body,
    href: "/systems",
    source: "System",
    sourceId: "sms",
    severity,
    createdAt: stamp(),
  });
}

/** Operator-facing explanation for the provider codes we have actually seen. */
function explain(provider: SmsOutcome["provider"], reason: string): string {
  if (provider === "aliyun") {
    if (/AMOUNT_NOT_ENOUGH/i.test(reason)) return "阿里云国际短信套餐包已用完 —— 请到阿里云控制台「短信服务 → 国际/港澳台短信」购买套餐包或充值,到账即恢复,无需重新部署。";
    if (/BUSINESS_LIMIT_CONTROL/i.test(reason)) return "阿里云触发频控(同号码发送过于频繁),稍后自动恢复。";
    if (/SignatureDoesNotMatch|InvalidAccessKeyId|Forbidden/i.test(reason)) return "阿里云 AccessKey 无效或无权限 —— 检查 Vercel 的 ALIYUN_SMS_ACCESS_KEY_ID / SECRET。";
    return `阿里云返回 ${reason}。`;
  }
  if (provider === "twilio") {
    if (/^401$/.test(reason)) return "Twilio 凭据被拒(401)—— Auth Token 失效或账号停用,更新 Vercel 的 TWILIO_AUTH_TOKEN 后重新部署。";
    if (/^(402|429)$/.test(reason)) return `Twilio 余额不足或限流(${reason})。`;
    return `Twilio 返回 ${reason}。`;
  }
  return reason;
}

/**
 * Record the outcome of one OTP delivery attempt and raise HQ alerts when the
 * channel is down or the package is running out. Never throws — delivery
 * feedback must not break login.
 */
export async function recordSmsOutcome(attempts: SmsOutcome[]): Promise<void> {
  try {
    // Fresh read first: several serverless instances write this record, and
    // a stale counter overwriting a newer one would silently undercount.
    await refreshCollectionsFromDatabase(["systemSettings", "notifications"]);
    const health = readHealth();
    const { size, since } = packageConfig();
    // New package bought → counter restarts from its purchase date.
    if (since !== health.packageSince) {
      health.packageSince = since;
      health.sentSincePackage = 0;
      health.warned80 = false;
      health.warned95 = false;
    }
    health.packageSize = size;

    const delivered = attempts.find((attempt) => attempt.ok);
    const now = stamp();
    if (delivered) {
      const recovered = health.consecutiveFailures > 0;
      health.lastSuccessAt = now;
      health.consecutiveFailures = 0;
      health.sentSincePackage += 1;
      if (recovered) {
        notifyHq(`ntf-sms-recovered-${Date.now()}`, "短信通道已恢复", `验证码短信已通过 ${delivered.provider} 正常发出。`, "Medium");
      }
      // Early warning — only when the package size is known.
      if (size) {
        const pct = Math.round((health.sentSincePackage / size) * 100);
        health.usagePct = pct;
        if (pct >= 95 && !health.warned95) {
          health.warned95 = true;
          notifyHq(`ntf-sms-usage95-${Date.now()}`, "短信套餐即将用完 (≥95%)", `本套餐已发 ${health.sentSincePackage} / ${size} 条,请立即购买新套餐包,并更新 SMS_PACKAGE_SIZE / SMS_PACKAGE_SINCE。`, "High");
        } else if (pct >= 80 && !health.warned80) {
          health.warned80 = true;
          notifyHq(`ntf-sms-usage80-${Date.now()}`, "短信套餐用量已达 80%", `本套餐已发 ${health.sentSincePackage} / ${size} 条,建议提前购买下一个套餐包。`, "Medium");
        }
      } else {
        health.usagePct = null;
      }
    } else {
      const failures = attempts.filter((attempt) => !attempt.ok && attempt.provider !== "none");
      const reason = failures.map((attempt) => `${attempt.provider}: ${attempt.reason ?? "failed"}`).join(" | ") || "no provider configured";
      health.lastFailureAt = now;
      health.lastFailureReason = reason;
      health.consecutiveFailures += 1;
      const lastAlertMs = health.lastAlertAt ? new Date(health.lastAlertAt.replace(" ", "T") + ":00Z").getTime() : 0;
      const dueAgain = Date.now() - lastAlertMs >= ALERT_INTERVAL_MS;
      if (dueAgain || health.lastAlertReason !== reason) {
        health.lastAlertAt = now;
        health.lastAlertReason = reason;
        const detail = failures.map((attempt) => explain(attempt.provider, attempt.reason ?? "failed")).join(" ");
        notifyHq(
          `ntf-sms-down-${Date.now()}`,
          "短信发送失败 — 骑手收不到验证码",
          `${detail || reason} 连续失败 ${health.consecutiveFailures} 次。`,
          health.consecutiveFailures >= 3 ? "Critical" : "High",
        );
      }
    }
    writeHealth(health);
    await flushPendingToDatabase();
  } catch (error) {
    console.warn("[sms-health] record failed", error);
  }
}

/** Read-only snapshot for /api/health and dashboards. */
export function smsHealthSnapshot(): SmsHealth & { configured: { aliyun: boolean; twilio: boolean } } {
  const health = readHealth();
  const { size, since } = packageConfig();
  return {
    ...health,
    packageSize: size,
    packageSince: since,
    usagePct: size ? Math.round((health.sentSincePackage / size) * 100) : null,
    configured: {
      aliyun: !!process.env.ALIYUN_SMS_ACCESS_KEY_ID && !!process.env.ALIYUN_SMS_ACCESS_KEY_SECRET,
      twilio: !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_FROM,
    },
  };
}
