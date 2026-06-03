export type SettingStatus = "Active" | "Draft" | "Paused";
export type SettingCategory = "Incentive" | "Incident SLA" | "Notification" | "Night Shift" | "Security";

export type SystemSetting = {
  id: string;
  category: SettingCategory;
  name: string;
  value: string;
  unit: string;
  status: SettingStatus;
  owner: string;
  updatedAt: string;
  description: string;
};

export const systemSettings: SystemSetting[] = [
  {
    id: "set-001",
    category: "Incentive",
    name: "Night Shift Completion Bonus",
    value: "120",
    unit: "BRL",
    status: "Active",
    owner: "Finance Ops",
    updatedAt: "2026-05-15 09:00",
    description: "Default reward for verified full night shift coverage.",
  },
  {
    id: "set-002",
    category: "Incident SLA",
    name: "Critical Incident First Response",
    value: "10",
    unit: "minutes",
    status: "Active",
    owner: "Support Desk",
    updatedAt: "2026-05-15 09:20",
    description: "Maximum first-contact SLA for critical rider incidents.",
  },
  {
    id: "set-003",
    category: "Notification",
    name: "In-App Chat Broadcast Throttle",
    value: "3",
    unit: "messages/hour",
    status: "Active",
    owner: "Regional Manager",
    updatedAt: "2026-05-15 10:05",
    description: "Limits broadcast pressure per in-app chat room during normal operations.",
  },
  {
    id: "set-004",
    category: "Night Shift",
    name: "Risk Area Score Threshold",
    value: "50",
    unit: "risk score",
    status: "Active",
    owner: "Ops Desk SP-East",
    updatedAt: "2026-05-15 10:30",
    description: "Ponto risk score where an area enters active night watch.",
  },
  {
    id: "set-005",
    category: "Security",
    name: "Login Attempt Limit",
    value: "5",
    unit: "attempts",
    status: "Draft",
    owner: "Security Ops",
    updatedAt: "2026-05-15 11:10",
    description: "Maximum failed login attempts before challenge or block.",
  },
];
