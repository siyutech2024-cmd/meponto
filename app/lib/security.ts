import { permissionLabels, rolePermissions, roles, type Permission, type Role } from "./rbac";

export type SecurityStatus = "Ready" | "Monitor" | "Action Needed";
export type SecurityRisk = "Low" | "Medium" | "High";

export type LoginAuditEntry = {
  id: string;
  actor: string;
  role: Role;
  method: "Password" | "Password + OTP" | "Session Resume";
  location: string;
  ip: string;
  device: string;
  outcome: "Success" | "Blocked" | "Challenged";
  createdAt: string;
  risk: SecurityRisk;
};

export type RbacRiskCheck = {
  id: string;
  title: string;
  detail: string;
  role: Role;
  permission: Permission;
  status: SecurityStatus;
  risk: SecurityRisk;
};

export type ReadinessItem = {
  id: string;
  title: string;
  status: SecurityStatus;
  detail: string;
  owner: string;
};

export type RiskEvent = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  status: "Open" | "Watching" | "Resolved";
  risk: SecurityRisk;
};

export type SecurityPosture = {
  postureScore: number;
  summary: {
    loginLimitStatus: SecurityStatus;
    tokenJwtReadiness: SecurityStatus;
    cpfEncryptionReadiness: SecurityStatus;
    highRiskEvents: number;
  };
  loginAudit: LoginAuditEntry[];
  rbacRiskChecks: RbacRiskCheck[];
  readiness: {
    tokenJwt: ReadinessItem[];
    loginLimits: ReadinessItem[];
    cpfEncryption: ReadinessItem[];
  };
  riskEvents: RiskEvent[];
};

export const loginAudit: LoginAuditEntry[] = [
  {
    id: "login-001",
    actor: "Super Admin",
    role: "Super Admin",
    method: "Password + OTP",
    location: "Sao Paulo HQ",
    ip: "189.32.18.42",
    device: "Chrome / macOS",
    outcome: "Success",
    createdAt: "2026-05-15 17:41",
    risk: "Low",
  },
  {
    id: "login-002",
    actor: "Finance Ops",
    role: "Finance",
    method: "Password",
    location: "Sao Paulo Remote",
    ip: "201.86.44.19",
    device: "Edge / Windows",
    outcome: "Challenged",
    createdAt: "2026-05-15 16:58",
    risk: "Medium",
  },
  {
    id: "login-003",
    actor: "Support Desk",
    role: "Support",
    method: "Password",
    location: "Unknown VPN Exit",
    ip: "45.178.9.20",
    device: "Mobile Safari / iOS",
    outcome: "Blocked",
    createdAt: "2026-05-15 15:33",
    risk: "High",
  },
  {
    id: "login-004",
    actor: "Regional Manager",
    role: "Regional Manager",
    method: "Session Resume",
    location: "Sao Paulo Core Network",
    ip: "10.2.4.18",
    device: "Chrome / Android",
    outcome: "Success",
    createdAt: "2026-05-15 14:10",
    risk: "Low",
  },
];

export const readiness: SecurityPosture["readiness"] = {
  tokenJwt: [
    {
      id: "jwt-001",
      title: "JWT issuer and audience claims",
      status: "Ready",
      detail: "Demo posture expects issuer, audience, issued-at, and expiry claims before production auth wiring.",
      owner: "Platform",
    },
    {
      id: "jwt-002",
      title: "Refresh token rotation",
      status: "Monitor",
      detail: "Rotation policy is documented for demo readiness; persistence backend is still pending.",
      owner: "Security",
    },
    {
      id: "jwt-003",
      title: "Short-lived access token TTL",
      status: "Ready",
      detail: "Target access token lifetime is 15 minutes with server-side revocation events.",
      owner: "Platform",
    },
  ],
  loginLimits: [
    {
      id: "limit-001",
      title: "Failed attempt throttle",
      status: "Ready",
      detail: "Five failed attempts in 10 minutes should trigger progressive backoff.",
      owner: "Security",
    },
    {
      id: "limit-002",
      title: "Suspicious IP challenge",
      status: "Monitor",
      detail: "Unknown ASN or VPN exits should require OTP challenge before dashboard access.",
      owner: "Ops",
    },
    {
      id: "limit-003",
      title: "Admin lockout escalation",
      status: "Ready",
      detail: "Super Admin lockouts should create a high-risk audit event.",
      owner: "Security",
    },
  ],
  cpfEncryption: [
    {
      id: "cpf-001",
      title: "CPF field classification",
      status: "Ready",
      detail: "CPF is classified as sensitive identity data across rider records and audit exports.",
      owner: "Data",
    },
    {
      id: "cpf-002",
      title: "At-rest encryption envelope",
      status: "Action Needed",
      detail: "Production storage still needs KMS-backed envelope encryption for CPF and PIX identifiers.",
      owner: "Platform",
    },
    {
      id: "cpf-003",
      title: "Masked UI display",
      status: "Monitor",
      detail: "Demo records currently show CPF in rider screens; production UI should default to masked values.",
      owner: "Product",
    },
  ],
};

export const riskEvents: RiskEvent[] = [
  {
    id: "risk-001",
    title: "Blocked support login from unknown VPN",
    detail: "Support credentials were blocked from a non-core network IP and should remain under watch.",
    createdAt: "2026-05-15 15:33",
    status: "Open",
    risk: "High",
  },
  {
    id: "risk-002",
    title: "Finance role challenged before payout review",
    detail: "Finance session passed a step-up challenge before opening payout controls.",
    createdAt: "2026-05-15 16:58",
    status: "Watching",
    risk: "Medium",
  },
  {
    id: "risk-003",
    title: "Demo dataset reset permission checked",
    detail: "Reset capability remains restricted to Super Admin in the RBAC matrix.",
    createdAt: "2026-05-15 13:21",
    status: "Resolved",
    risk: "Low",
  },
];

const elevatedPermissions: Permission[] = ["reset_demo", "view_finance", "manage_rewards", "view_audit"];

export function getRbacRiskChecks(): RbacRiskCheck[] {
  return roles.flatMap((role) =>
    elevatedPermissions
      .filter((permission) => rolePermissions[role].includes(permission))
      .map((permission) => {
        const superAdminOnly = permission === "reset_demo";
        const financeAccessOutsideFinance = permission === "view_finance" && role !== "Finance" && role !== "Super Admin";
        const risk: SecurityRisk = superAdminOnly && role !== "Super Admin" ? "High" : financeAccessOutsideFinance ? "Medium" : "Low";

        return {
          id: `${role.toLowerCase().replaceAll(" ", "-")}-${permission}`,
          title: `${role} can ${permissionLabels[permission].toLowerCase()}`,
          detail:
            risk === "Low"
              ? "Permission is aligned with the current demo RBAC baseline."
              : "Review whether this elevated permission is required for the role.",
          role,
          permission,
          status: risk === "Low" ? "Ready" : "Monitor",
          risk,
        };
      }),
  );
}

export function getSecurityPosture(): SecurityPosture {
  const rbacRiskChecks = getRbacRiskChecks();
  const highRiskEvents = riskEvents.filter((event) => event.risk === "High" && event.status !== "Resolved").length;
  const actionNeededCount = Object.values(readiness).flat().filter((item) => item.status === "Action Needed").length;
  const monitorCount =
    Object.values(readiness).flat().filter((item) => item.status === "Monitor").length +
    rbacRiskChecks.filter((item) => item.status === "Monitor").length;

  return {
    postureScore: Math.max(0, 92 - highRiskEvents * 8 - actionNeededCount * 7 - monitorCount * 2),
    summary: {
      loginLimitStatus: "Ready",
      tokenJwtReadiness: "Monitor",
      cpfEncryptionReadiness: "Action Needed",
      highRiskEvents,
    },
    loginAudit,
    rbacRiskChecks,
    readiness,
    riskEvents,
  };
}
