import type { Permission, Role } from "./rbac";

export type PortalId = "pontosys" | "franchise" | "ponto" | "rider" | "partner" | "supplier" | "pontomall";

export type PortalModule = {
  href: string;
  label: string;
  description: string;
  permission?: Permission;
};

export type PortalConfig = {
  id: PortalId;
  productName: string;
  title: string;
  description: string;
  homePath: string;
  loginHint: string;
  allowedRoles: Role[];
  modules: PortalModule[];
  vercelPath: string;
  futureDomain: string;
};

export type TestAccount = {
  id: string;
  name: string;
  portal: PortalId;
  role: Role;
  identifier: string;
  phone: string;
  password: string;
  organization: string;
  tenantId: string;
  defaultPath: string;
};

export const portalConfigs: Record<PortalId, PortalConfig> = {
  pontosys: {
    id: "pontosys",
    productName: "PontoSys",
    title: "PontoSys 主后台",
    description: "总部运营、风控、财务、报表、权限、审计和全网排班查看。",
    homePath: "/pontosys",
    loginHint: "总部账号",
    allowedRoles: ["Super Admin", "Regional Manager", "Finance", "Support"],
    vercelPath: "/pontosys",
    futureDomain: "sys.meponto.com",
    modules: [
      { href: "/operations-core", label: "运力运营核心", description: "T+1 报表、KPI、三级名额与白名单导出。", permission: "view_dashboard" },
      { href: "/dashboard", label: "总部仪表盘", description: "全网运营、风险和排班汇总。", permission: "view_dashboard" },
      { href: "/slot-enrollment", label: "排班总览", description: "查看站点、加盟商、总部审核链路并导出清单。", permission: "manage_slots" },
      { href: "/riders", label: "骑手档案", description: "维护骑手、敏感资料和状态。", permission: "manage_riders" },
      { href: "/pontos", label: "站点网络", description: "维护 Ponto 站点、负责人和容量。", permission: "manage_pontos" },
      { href: "/franchise", label: "加盟治理", description: "合作条款、SOP 和加盟商管理口径。", permission: "view_analytics" },
      { href: "/finance", label: "财务与结算", description: "激励、付款和积分财务审批。", permission: "view_finance" },
      { href: "/marketplace", label: "PontoMall 管理", description: "商城库存、兑换订单和积分规则。", permission: "manage_marketplace" },
      { href: "/access-control", label: "权限矩阵", description: "账号、角色和功能权限分离。", permission: "view_audit" },
      { href: "/reports", label: "报表导出", description: "运营、站点、骑手和排班报表。", permission: "view_analytics" },
    ],
  },
  partner: {
    id: "partner",
    productName: "Partner 服务点",
    title: "Partner 服务点端",
    description: "维修、加油、餐车、通讯与装备服务点进行服务核销并赚取生态积分。",
    homePath: "/partner-app",
    loginHint: "Partner 账号",
    allowedRoles: ["Partner Operator", "Super Admin"],
    vercelPath: "/partner-app",
    futureDomain: "partner.meponto.com",
    modules: [
      { href: "/partner-points", label: "服务与积分", description: "服务确认、核销记录与 Partner 积分。", permission: "manage_partner_services" },
      { href: "/marketplace", label: "生态消费", description: "Partner 使用积分兑换平台权益。", permission: "manage_partner_points" },
    ],
  },
  supplier: {
    id: "supplier",
    productName: "供应链后台",
    title: "供应链后台",
    description: "供应商管理 SKU、供应底价、媒体资产、发货单和月度对账。",
    homePath: "/supplier-admin",
    loginHint: "供应商账号",
    allowedRoles: ["Supplier Admin", "Super Admin"],
    vercelPath: "/supplier-admin",
    futureDomain: "supplier.meponto.com",
    modules: [
      { href: "/marketplace", label: "商品与订单", description: "查看商品状态、库存与站点履约订单。", permission: "manage_supplier_catalog" },
      { href: "/reports", label: "供应商对账", description: "查看供应价应结款和月度流水。", permission: "manage_supplier_catalog" },
    ],
  },
  franchise: {
    id: "franchise",
    productName: "加盟商后台",
    title: "加盟商后台",
    description: "加盟商查看自己区域的站点、骑手、排班确认、PontoMall 和经营数据。",
    homePath: "/franchise-admin",
    loginHint: "加盟商账号",
    allowedRoles: ["Franchise Admin", "Regional Manager", "Super Admin"],
    vercelPath: "/franchise-admin",
    futureDomain: "franchise.meponto.com",
    modules: [
      { href: "/slot-enrollment", label: "排班确认", description: "接收站点审核后的报名，进行加盟商确认。", permission: "manage_slots" },
      { href: "/franchise", label: "合作方案", description: "查看加盟模型、SOP、KPI 和月度治理节奏。", permission: "view_analytics" },
      { href: "/pontos", label: "站点列表", description: "查看/维护所属站点基础信息。", permission: "manage_pontos" },
      { href: "/riders", label: "骑手运营", description: "查看所属骑手与状态。", permission: "manage_riders" },
      { href: "/marketplace", label: "PontoMall 兑换", description: "查看加盟商积分权益与兑换订单。", permission: "manage_marketplace" },
      { href: "/reports", label: "经营报表", description: "查看站点与排班结果报表。", permission: "view_analytics" },
    ],
  },
  ponto: {
    id: "ponto",
    productName: "站点后台",
    title: "站点后台",
    description: "站点进行骑手报名初审、现场运营、事故上报和本站点骑手维护。",
    homePath: "/ponto-admin",
    loginHint: "站点账号",
    allowedRoles: ["Ponto Manager", "Leader", "Super Admin"],
    vercelPath: "/ponto-admin",
    futureDomain: "ponto.meponto.com",
    modules: [
      { href: "/slot-enrollment", label: "排班初审", description: "审核骑手报名并提交给加盟商。", permission: "manage_slots" },
      { href: "/riders", label: "本站骑手", description: "维护站点骑手档案、状态和排班资格。", permission: "manage_riders" },
      { href: "/pontos", label: "站点资料", description: "查看站点位置、容量和负责人。", permission: "manage_pontos" },
      { href: "/incidents", label: "异常上报", description: "创建事故、服务和安全异常。", permission: "create_incidents" },
      { href: "/chat", label: "站点沟通", description: "站点与骑手的运营沟通。", permission: "view_dashboard" },
    ],
  },
  rider: {
    id: "rider",
    productName: "MePonto 骑手APP",
    title: "MePonto 骑手APP",
    description: "骑手查看积分、排班 slots、报名状态、商城兑换和个人运营信息。",
    homePath: "/app",
    loginHint: "骑手账号",
    allowedRoles: ["Rider", "Super Admin"],
    vercelPath: "/app",
    futureDomain: "app.meponto.com",
    modules: [
      { href: "/rider-app", label: "骑手首页", description: "查看个人积分、排班 slots 并提交报名。", permission: "use_rider_app" },
      { href: "/marketplace", label: "PontoMall", description: "使用积分兑换骑手权益。", permission: "use_rider_app" },
      { href: "/rewards", label: "积分记录", description: "查看奖励、积分和激励记录。", permission: "use_rider_app" },
    ],
  },
  pontomall: {
    id: "pontomall",
    productName: "PontoMall",
    title: "PontoMall 积分商城",
    description: "商品目录、库存、兑换订单、合作伙伴积分和商城运营。",
    homePath: "/pontomall",
    loginHint: "商城运营账号",
    allowedRoles: ["Mall Operator", "Finance", "Super Admin"],
    vercelPath: "/pontomall",
    futureDomain: "mall.meponto.com",
    modules: [
      { href: "/marketplace", label: "商城工作台", description: "商品、库存和兑换订单。", permission: "manage_marketplace" },
      { href: "/points-economy", label: "积分经济", description: "积分规则、发放、扣减和核算模型。", permission: "manage_points" },
      { href: "/partner-points", label: "Partner 积分", description: "合作伙伴积分服务与权益。", permission: "manage_partner_points" },
      { href: "/crm", label: "合作伙伴 CRM", description: "供应商和合作伙伴运营。", permission: "view_analytics" },
      { href: "/finance", label: "商城财务", description: "兑换、库存和积分结算。", permission: "view_finance" },
    ],
  },
};

export const testAccounts: TestAccount[] = [
  {
    id: "acct-hq",
    name: "HQ Operations",
    portal: "pontosys",
    role: "Super Admin",
    identifier: "hq@meponto.com",
    phone: "+55 11 90000-0000",
    password: "pontosys-hq",
    organization: "MePonto HQ",
    tenantId: "tenant-platform",
    defaultPath: "/pontosys",
  },
  {
    id: "acct-franchise",
    name: "SP Core Franchise Admin",
    portal: "franchise",
    role: "Franchise Admin",
    identifier: "franchise@meponto.com",
    phone: "+55 11 90000-0001",
    password: "franquia-demo",
    organization: "SP Core Franchise",
    tenantId: "tenant-fr-sp-core",
    defaultPath: "/franchise-admin",
  },
  {
    id: "acct-ponto",
    name: "Ponto Paulista Manager",
    portal: "ponto",
    role: "Ponto Manager",
    identifier: "ponto@meponto.com",
    phone: "+55 11 90000-0002",
    password: "ponto-demo",
    organization: "Ponto Paulista",
    tenantId: "tenant-st-paulista",
    defaultPath: "/ponto-admin",
  },
  {
    id: "acct-rider",
    name: "Carlos Mendes",
    portal: "rider",
    role: "Rider",
    identifier: "rider@meponto.com",
    phone: "+55 11 90000-0003",
    password: "rider-demo",
    organization: "Ponto Paulista",
    tenantId: "tenant-st-paulista",
    defaultPath: "/app",
  },
  {
    id: "acct-mall",
    name: "PontoMall Operator",
    portal: "pontomall",
    role: "Mall Operator",
    identifier: "mall@meponto.com",
    phone: "+55 11 90000-0004",
    password: "pontomall-demo",
    organization: "PontoMall",
    tenantId: "tenant-platform",
    defaultPath: "/pontomall",
  },
  {
    id: "acct-partner",
    name: "Oficina Partner Operator",
    portal: "partner",
    role: "Partner Operator",
    identifier: "partner@meponto.com",
    phone: "+55 11 90000-0005",
    password: "partner-demo",
    organization: "Oficina Paulista 24h",
    tenantId: "tenant-partner-repair",
    defaultPath: "/partner-app",
  },
  {
    id: "acct-supplier",
    name: "SupriMoto Supplier Admin",
    portal: "supplier",
    role: "Supplier Admin",
    identifier: "supplier@meponto.com",
    phone: "+55 11 90000-0006",
    password: "supplier-demo",
    organization: "SupriMoto Equipamentos",
    tenantId: "tenant-supplier-equipment",
    defaultPath: "/supplier-admin",
  },
];

export const portalHostMap: Record<string, PortalId> = {
  "sys.meponto.com": "pontosys",
  "admin.meponto.com": "pontosys",
  "franchise.meponto.com": "franchise",
  "station.meponto.com": "ponto",
  "ponto.meponto.com": "ponto",
  "app.meponto.com": "rider",
  "partner.meponto.com": "partner",
  "supplier.meponto.com": "supplier",
  "mall.meponto.com": "pontomall",
  "meponto.com": "rider",
  "www.meponto.com": "rider",
  // Interim per-portal entrances on vercel.app, usable before meponto.com DNS
  // is configured. Each maps one deployment alias to its portal.
  "meponto-sys.vercel.app": "pontosys",
  "meponto-franchise.vercel.app": "franchise",
  "meponto-ponto.vercel.app": "ponto",
  "meponto-riders.vercel.app": "rider",
  "meponto-mall.vercel.app": "pontomall",
  "meponto-partner.vercel.app": "partner",
  "meponto-supplier.vercel.app": "supplier",
};

export function findTestAccount(identifier: string, password: string) {
  const normalized = identifier.trim().toLowerCase();
  return testAccounts.find(
    (account) =>
      (account.identifier.toLowerCase() === normalized || account.phone.replace(/\s/g, "") === identifier.replace(/\s/g, "")) &&
      account.password === password,
  );
}

export function portalForPath(pathname: string): PortalConfig {
  const direct = Object.values(portalConfigs).find((portal) => pathname === portal.homePath || pathname.startsWith(`${portal.homePath}/`));
  if (direct) return direct;

  const moduleOwner = Object.values(portalConfigs).find((portal) =>
    portal.modules.some((module) => pathname === module.href || pathname.startsWith(`${module.href}/`)),
  );
  return moduleOwner ?? portalConfigs.pontosys;
}

export function portalForRole(role: Role): PortalConfig | undefined {
  const rolePortals: Partial<Record<Role, PortalId>> = {
    "Franchise Admin": "franchise",
    "Ponto Manager": "ponto",
    Leader: "ponto",
    Rider: "rider",
    "Mall Operator": "pontomall",
    "Partner Operator": "partner",
    "Supplier Admin": "supplier",
  };
  const portalId = rolePortals[role];
  return portalId ? portalConfigs[portalId] : undefined;
}
