export type LeadType = "franchise" | "partner" | "rider";
export type LeadStatus = "new" | "contacted" | "closed";

export type Lead = {
  id: string;
  type: LeadType;
  name: string;
  phone: string;
  email: string;
  city: string;
  message: string;
  language: string;
  source: string;
  status: LeadStatus;
  createdAt: string;
};

export const leadTypes: LeadType[] = ["franchise", "partner", "rider"];

/** Seed is intentionally empty — every lead comes from the public site. */
export const leads: Lead[] = [];
