import { memory } from "./memory";
import type { CrmAccountType } from "../crm";

/**
 * Resolve a CRM category label to its account-type routing rule. Categories are
 * configurable from the CRM back office (`memory.crmCategories`); when a label
 * isn't found (legacy data or before hydration) we fall back to the historical
 * default where only "Supplier" is a supply-chain account.
 */
export function accountTypeForCategory(label: string): CrmAccountType {
  const match = memory.crmCategories.find((category) => category.label === label);
  if (match) return match.accountType;
  return label === "Supplier" ? "supplier" : "partner";
}

/** True when the category routes to the supply-chain console (/mall/supplier). */
export function isSupplierCategory(label: string): boolean {
  return accountTypeForCategory(label) === "supplier";
}
