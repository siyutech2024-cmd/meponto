export type CrmPartnerCategory = "Repair Shop" | "Partner Vehicle Shop" | "Supplier" | "Vehicle Partner";
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
};

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
  },
];
