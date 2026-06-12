export type Role =
  | "Super Admin"
  | "Franchise Admin"
  | "Ponto Manager"
  | "Rider"
  | "Mall Operator"
  | "Partner Operator"
  | "Supplier Admin"
  | "Regional Manager"
  | "Leader"
  | "Finance"
  | "Support";

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
  | "manage_partner_services"
  | "manage_supplier_catalog"
  | "manage_slots"
  | "use_rider_app"
  | "view_finance"
  | "view_analytics"
  | "view_audit"
  | "reset_demo";

export const roles: Role[] = [
  "Super Admin",
  "Franchise Admin",
  "Ponto Manager",
  "Rider",
  "Mall Operator",
  "Partner Operator",
  "Supplier Admin",
  "Regional Manager",
  "Leader",
  "Finance",
  "Support",
];

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
  manage_partner_services: "Manage partner services",
  manage_supplier_catalog: "Manage supplier catalog",
  manage_slots: "Manage rider slots",
  use_rider_app: "Use rider app",
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
    "manage_partner_services",
    "manage_supplier_catalog",
    "manage_slots",
    "use_rider_app",
    "view_finance",
    "view_analytics",
    "view_audit",
    "reset_demo",
  ],
  "Franchise Admin": [
    "view_dashboard",
    "manage_riders",
    "manage_pontos",
    "view_finance",
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
  "Ponto Manager": ["view_dashboard", "manage_riders", "manage_pontos", "create_incidents", "close_incidents", "manage_rewards", "manage_partner_points", "manage_slots", "view_analytics"],
  Rider: ["use_rider_app", "manage_marketplace"],
  "Mall Operator": ["view_dashboard", "manage_marketplace", "manage_points", "manage_partner_points", "view_analytics", "view_audit", "view_finance"],
  "Partner Operator": ["view_dashboard", "manage_marketplace", "manage_partner_points", "manage_partner_services"],
  "Supplier Admin": ["view_dashboard", "manage_marketplace", "manage_supplier_catalog", "view_analytics"],
  Leader: ["view_dashboard", "create_incidents", "manage_slots", "view_analytics"],
  Finance: ["view_dashboard", "manage_rewards", "manage_points", "manage_marketplace", "view_finance", "view_analytics", "view_audit"],
  Support: ["view_dashboard", "create_incidents", "close_incidents", "view_analytics", "view_audit"],
};

export function can(role: Role | undefined, permission: Permission) {
  return role ? (rolePermissions[role]?.includes(permission) ?? false) : false;
}
