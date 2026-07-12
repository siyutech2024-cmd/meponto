// Category labels are configurable at runtime from the CRM back office (see
// `crmCategories`), so the type is a plain string — any label the office adds is
// valid. The four values below are the seeded defaults.
export type CrmPartnerCategory = string;

/** Which back office a category's provisioned login lands in. */
export type CrmAccountType = "supplier" | "partner";

/** A configurable CRM partner category with its account-type routing rule. */
export type CrmCategory = {
  id: string;
  label: string;
  accountType: CrmAccountType; // supplier → /mall/supplier ; partner → /partner-points
  sort: number;
  active: boolean;
};

export type CrmPartnerStatus = "Active" | "Prospect" | "Review" | "Suspended";
export type CrmPartnerTier = "Strategic" | "Preferred" | "Standard" | "Watchlist";
export type CrmPartnerRisk = "Low" | "Medium" | "High";

export type CrmPartner = {
  id: string;
  name: string;
  category: CrmPartnerCategory;
  status: CrmPartnerStatus;
  tier: CrmPartnerTier;
  contactName: string;
  phone: string;
  bairro: string;
  owner: string;
  slaHours: number;
  monthlyVolume: number;
  activeDeals: number;
  vehiclesAvailable: number;
  contractRenewal: string;
  risk: CrmPartnerRisk;
  notes: string;
  services: string[];
  lat: number;
  lng: number;
  // Self-registration extras (public /partner-register funnel).
  address?: string; // full street address of the service point
  mapUrl?: string; // Google Maps (or similar) link to the service point
  invitedBy?: string; // referrer id/99ID carried by /partner-register?ref=
  // Rider-facing benefit (shown in the rider app). Optional — only partners
  // with an active offer surface under "合作权益 / Benefits".
  riderDiscountBRL?: number;
  riderRewardPoints?: number;
};

/** Seeded default categories. Only "Supplier" routes to the supply-chain
 *  console (/mall/supplier); the rest are Partner service points. Editable from
 *  the CRM back office at runtime. */
export const crmCategories: CrmCategory[] = [
  { id: "cat-repair", label: "Repair Shop", accountType: "partner", sort: 1, active: true },
  { id: "cat-partner-vehicle", label: "Partner Vehicle Shop", accountType: "partner", sort: 2, active: true },
  { id: "cat-supplier", label: "Supplier", accountType: "supplier", sort: 3, active: true },
  { id: "cat-vehicle-partner", label: "Vehicle Partner", accountType: "partner", sort: 4, active: true },
  // Default service-partner types (rider daily-life ecosystem). Canonical
  // labels stay in English like the four above — the runtime i18n phrase
  // dictionary handles zh/pt display. Seeded idempotently by label (see
  // ensureDefaultCrmCategories) so user-created categories are never touched
  // and existing labels are never duplicated. 摩托维修保养/加油站/换电电池/洗车/
  // 餐饮小吃/药房/便利店/手机维修/保险代理/车辆租赁.
  { id: "cat-moto-maintenance", label: "Moto Repair & Maintenance", accountType: "partner", sort: 5, active: true },
  { id: "cat-gas-station", label: "Gas Station", accountType: "partner", sort: 6, active: true },
  { id: "cat-battery-swap", label: "Battery Swap", accountType: "partner", sort: 7, active: true },
  { id: "cat-vehicle-wash", label: "Vehicle Wash", accountType: "partner", sort: 8, active: true },
  { id: "cat-food-snacks", label: "Food & Snacks", accountType: "partner", sort: 9, active: true },
  { id: "cat-pharmacy", label: "Pharmacy", accountType: "partner", sort: 10, active: true },
  { id: "cat-convenience", label: "Convenience Store", accountType: "partner", sort: 11, active: true },
  { id: "cat-phone-repair", label: "Phone Repair", accountType: "partner", sort: 12, active: true },
  { id: "cat-insurance", label: "Insurance Agency", accountType: "partner", sort: 13, active: true },
  { id: "cat-vehicle-rental", label: "Vehicle Rental", accountType: "partner", sort: 14, active: true },
];

export const crmPartners: CrmPartner[] = [
  {
    id: "crm-001",
    name: "Oficina Paulista 24h",
    category: "Repair Shop",
    status: "Active",
    tier: "Preferred",
    contactName: "Marina Lopes",
    phone: "+55 11 94402-8800",
    bairro: "Bela Vista",
    owner: "Ops Desk SP-Centro",
    slaHours: 3,
    monthlyVolume: 46,
    activeDeals: 2,
    vehiclesAvailable: 0,
    contractRenewal: "2026-08-30",
    risk: "Low",
    notes: "Night breakdown priority lane for Paulista and Liberdade pontos.",
    services: ["Tires", "Emergency repair", "Tow handoff"],
    lat: -23.5589,
    lng: -46.6446,
    riderDiscountBRL: 20,
    riderRewardPoints: 100,
  },
  {
    id: "crm-002",
    name: "Motos Liberdade Trade",
    category: "Partner Vehicle Shop",
    status: "Active",
    tier: "Strategic",
    contactName: "Henrique Sato",
    phone: "+55 11 98831-4108",
    bairro: "Liberdade",
    owner: "Fleet Partnerships",
    slaHours: 8,
    monthlyVolume: 28,
    activeDeals: 5,
    vehiclesAvailable: 17,
    contractRenewal: "2026-11-15",
    risk: "Low",
    notes: "Used CG and Factor sourcing partner for fast rider onboarding.",
    services: ["Vehicle sourcing", "Trade-in", "Inspection"],
    lat: -23.5572,
    lng: -46.6351,
    riderDiscountBRL: 15,
    riderRewardPoints: 80,
  },
  {
    id: "crm-003",
    name: "SupriMoto Tatuape",
    category: "Supplier",
    status: "Review",
    tier: "Watchlist",
    contactName: "Bruno Nascimento",
    phone: "+55 11 97640-2219",
    bairro: "Tatuape",
    owner: "Procurement",
    slaHours: 24,
    monthlyVolume: 136,
    activeDeals: 1,
    vehiclesAvailable: 0,
    contractRenewal: "2026-06-20",
    risk: "High",
    notes: "Helmet stockouts reported twice this month; pricing under review.",
    services: ["Helmets", "Rain gear", "Brake pads"],
    lat: -23.5403,
    lng: -46.5768,
  },
  {
    id: "crm-004",
    name: "Mottu SP East Desk",
    category: "Vehicle Partner",
    status: "Active",
    tier: "Strategic",
    contactName: "Carla Ribeiro",
    phone: "+55 11 93319-7450",
    bairro: "Tatuape",
    owner: "Regional Manager SP-East",
    slaHours: 6,
    monthlyVolume: 63,
    activeDeals: 4,
    vehiclesAvailable: 22,
    contractRenewal: "2027-01-31",
    risk: "Medium",
    notes: "Rental queue synced weekly with high-AR riders and night-shift demand.",
    services: ["Rental fleet", "Swap routing", "Damage review"],
    lat: -23.5421,
    lng: -46.5794,
    riderDiscountBRL: 30,
    riderRewardPoints: 120,
  },
  {
    id: "crm-005",
    name: "Pinheiros Moto Care",
    category: "Repair Shop",
    status: "Prospect",
    tier: "Standard",
    contactName: "Lucas Duarte",
    phone: "+55 11 95574-0901",
    bairro: "Pinheiros",
    owner: "Ponto Manager Pinheiros",
    slaHours: 12,
    monthlyVolume: 12,
    activeDeals: 1,
    vehiclesAvailable: 0,
    contractRenewal: "2026-07-10",
    risk: "Medium",
    notes: "Pilot partner for west-side preventive maintenance blocks.",
    services: ["Preventive maintenance", "Oil", "Electrical"],
    lat: -23.5668,
    lng: -46.7008,
  },
];
