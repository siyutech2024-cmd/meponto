export type Role = "Super Admin" | "Regional Manager" | "Ponto Manager" | "Leader" | "Finance" | "Support";

export type Permission =
  | "view_dashboard"
  | "manage_riders"
  | "manage_pontos"
  | "manage_leaders"
  | "create_incidents"
  | "close_incidents"
  | "manage_rewards"
  | "manage_points"
  | "manage_marketplace"
  | "manage_partner_points"
  | "manage_slots"
  | "view_finance"
  | "view_analytics"
  | "view_audit"
  | "reset_demo";

export const roles: Role[] = ["Super Admin", "Regional Manager", "Ponto Manager", "Leader", "Finance", "Support"];

export const permissionLabels: Record<Permission, string> = {
  view_dashboard: "View dashboard",
  manage_riders: "Manage riders",
  manage_pontos: "Manage Pontos",
  manage_leaders: "Manage Leaders",
  create_incidents: "Create incidents",
  close_incidents: "Close incidents",
  manage_rewards: "Manage rewards",
  manage_points: "Manage points",
  manage_marketplace: "Manage marketplace",
  manage_partner_points: "Manage partner points",
  manage_slots: "Manage rider slots",
  view_finance: "View finance",
  view_analytics: "View analytics",
  view_audit: "View audit",
  reset_demo: "Reset demo data",
};

export const rolePermissions: Record<Role, Permission[]> = {
  "Super Admin": [
    "view_dashboard",
    "manage_riders",
    "manage_pontos",
    "manage_leaders",
    "create_incidents",
    "close_incidents",
    "manage_rewards",
    "manage_points",
    "manage_marketplace",
    "manage_partner_points",
    "manage_slots",
    "view_finance",
    "view_analytics",
    "view_audit",
    "reset_demo",
  ],
  "Regional Manager": [
    "view_dashboard",
    "manage_riders",
    "manage_pontos",
    "manage_leaders",
    "create_incidents",
    "close_incidents",
    "manage_rewards",
    "manage_points",
    "manage_marketplace",
    "manage_partner_points",
    "manage_slots",
    "view_analytics",
    "view_audit",
  ],
  "Ponto Manager": ["view_dashboard", "manage_riders", "create_incidents", "close_incidents", "manage_rewards", "manage_partner_points", "manage_slots", "view_analytics"],
  Leader: ["view_dashboard", "create_incidents", "manage_slots", "view_analytics"],
  Finance: ["view_dashboard", "manage_rewards", "manage_points", "manage_marketplace", "view_finance", "view_analytics", "view_audit"],
  Support: ["view_dashboard", "create_incidents", "close_incidents", "view_analytics", "view_audit"],
};

export function can(role: Role | undefined, permission: Permission) {
  return role ? (rolePermissions[role]?.includes(permission) ?? false) : false;
}
