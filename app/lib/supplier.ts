/**
 * Supplier company profile (供应商公司资料). One record per supplier
 * organization (keyed by the supplier name used across the mall). Holds brand
 * + legal + contact + payout details shown in the supplier console header and
 * used on statements/invoices.
 */

export type SupplierProfile = {
  id: string; // = supplier organization name (stable key)
  companyName: string;
  brand: string;
  cnpj: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  pixKey: string;
  logoUrl: string;
  about: string;
  updatedAt?: string;
  updatedBy?: string;
};

export function emptySupplierProfile(name: string): SupplierProfile {
  return {
    id: name,
    companyName: name,
    brand: name,
    cnpj: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
    pixKey: "",
    logoUrl: "",
    about: "",
  };
}

export const supplierProfiles: SupplierProfile[] = [];
