import { memory } from "./memory";
import { flushPendingToDatabase, refreshCollectionsFromDatabase } from "./persistence";
import { crmCategories as seededCrmCategories, type CrmAccountType } from "../crm";

/**
 * Resolve a CRM category label to its account-type routing rule. Categories are
 * configurable from the CRM back office (`memory.crmCategories`); when a label
 * isn't found (legacy data or before hydration) we fall back to the historical
 * default where only "Supplier" is a supply-chain account.
 */
// Canonical + translated aliases for the seeded supplier category, so records
// whose stored label drifted to a display translation (e.g. "供应商" / "Fornecedor")
// still route to the supply-chain console.
const SUPPLIER_ALIASES = new Set(["Supplier", "供应商", "Fornecedor"]);

export function accountTypeForCategory(label: string): CrmAccountType {
  const match = memory.crmCategories.find((category) => category.label === label);
  if (match) return match.accountType;
  return SUPPLIER_ALIASES.has(label) ? "supplier" : "partner";
}

/** True when the category routes to the supply-chain console (/mall/supplier). */
export function isSupplierCategory(label: string): boolean {
  return accountTypeForCategory(label) === "supplier";
}

/**
 * Idempotent default-category seeding for EXISTING deployments: instances that
 * hydrated `crmCategories` from the database never see additions to the seed
 * array in `app/lib/crm.ts`, so the category API tops up any missing default
 * here. Matching is by label (case-insensitive) — user-created categories are
 * untouched and existing labels are never duplicated. To hide a default, set
 * it inactive in the CRM back office (deleting it would re-seed on the next
 * cold instance).
 */
let ensuredDefaults: Promise<void> | null = null;

export function ensureDefaultCrmCategories(): Promise<void> {
  ensuredDefaults ??= (async () => {
    await refreshCollectionsFromDatabase(["crmCategories"]);
    const existing = new Set(memory.crmCategories.map((category) => category.label.trim().toLowerCase()));
    let maxSort = memory.crmCategories.reduce((max, category) => Math.max(max, category.sort ?? 0), 0);
    let added = false;
    for (const seed of seededCrmCategories) {
      if (existing.has(seed.label.trim().toLowerCase())) continue;
      memory.crmCategories.push({ ...seed, sort: ++maxSort });
      existing.add(seed.label.trim().toLowerCase());
      added = true;
    }
    // Field-repair pass: rows saved BEFORE the accountType field existed have
    // it undefined — which silently emptied every "supplier"-type filter and
    // broke CRM supplier filtering. Fill from the seed by label; supplier
    // aliases are always forced to route to the supply chain.
    const seedByLabel = new Map(seededCrmCategories.map((seed) => [seed.label.trim().toLowerCase(), seed]));
    for (let index = 0; index < memory.crmCategories.length; index += 1) {
      const row = memory.crmCategories[index];
      const seed = seedByLabel.get(row.label.trim().toLowerCase());
      const wantSupplier = SUPPLIER_ALIASES.has(row.label.trim());
      const nextType = wantSupplier ? "supplier" : !row.accountType && seed ? seed.accountType : row.accountType;
      if (nextType && nextType !== row.accountType) {
        memory.crmCategories[index] = { ...row, accountType: nextType };
        added = true;
      }
    }
    // Serverless safety: flush before the instance can freeze.
    if (added) await flushPendingToDatabase();
  })().catch(() => {
    // Never block the category API on a failed seed; retry on the next call.
    ensuredDefaults = null;
  }) as Promise<void>;
  return ensuredDefaults;
}
