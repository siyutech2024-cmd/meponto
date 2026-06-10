import { type Incident, type Leader, type LedgerEntry, type Ponto, type Rider, rewards } from "../data";
import type { CrmPartner } from "../crm";
import type { NotificationItem } from "../notifications";
import type { SystemSetting } from "../settings";
import type { ChatMessage, ChatRoom } from "../chat";
import { memory, type ServerAuditEntry } from "./memory";

export type RewardRule = (typeof rewards)[number];

export type AuditEvent = ServerAuditEntry;

export type EntityWithId = {
  id: string;
};

/**
 * Unified repository interface.
 *
 * All methods return Promise so both the in-memory and Supabase
 * implementations satisfy the same contract. Callers must `await`.
 */
export type Repository<T extends EntityWithId> = {
  all(): Promise<T[]>;
  findById(id: string): Promise<T | undefined>;
  insert(record: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T | undefined>;
  delete(id: string): Promise<T | undefined>;
  count(): Promise<number>;
};

type CollectionProvider<T extends EntityWithId> = () => T[];

/**
 * In-memory repository — wraps the existing global `memory` store.
 * Methods return resolved Promises so they match the async interface.
 */
class MemoryRepository<T extends EntityWithId> implements Repository<T> {
  constructor(private readonly getCollection: CollectionProvider<T>) {}

  async all() {
    return this.getCollection();
  }

  async findById(id: string) {
    return this.getCollection().find((record) => record.id === id);
  }

  async insert(record: T) {
    this.getCollection().unshift(record);
    return record;
  }

  async update(id: string, patch: Partial<T>) {
    const collection = this.getCollection();
    const index = collection.findIndex((record) => record.id === id);
    if (index === -1) return undefined;

    collection[index] = { ...collection[index], ...patch };
    return collection[index];
  }

  async delete(id: string) {
    const collection = this.getCollection();
    const index = collection.findIndex((record) => record.id === id);
    if (index === -1) return undefined;

    const [removed] = collection.splice(index, 1);
    return removed;
  }

  async count() {
    return this.getCollection().length;
  }
}

export type CoreRepositories = {
  riders: Repository<Rider>;
  incidents: Repository<Incident>;
  pontos: Repository<Ponto>;
  leaders: Repository<Leader>;
  rewards: Repository<RewardRule>;
  ledgerEntries: Repository<LedgerEntry>;
  notifications: Repository<NotificationItem>;
  crmPartners: Repository<CrmPartner>;
  chatRooms: Repository<ChatRoom>;
  chatMessages: Repository<ChatMessage>;
  systemSettings: Repository<SystemSetting>;
  auditEvents: Repository<AuditEvent>;
};

export function createMemoryRepositories(): CoreRepositories {
  return {
    riders: new MemoryRepository(() => memory.riders),
    incidents: new MemoryRepository(() => memory.incidents),
    pontos: new MemoryRepository(() => memory.pontos),
    leaders: new MemoryRepository(() => memory.leaders),
    rewards: new MemoryRepository(() => memory.rewards),
    ledgerEntries: new MemoryRepository(() => memory.ledgerEntries),
    notifications: new MemoryRepository(() => memory.notifications),
    crmPartners: new MemoryRepository(() => memory.crmPartners),
    chatRooms: new MemoryRepository(() => memory.chatRooms),
    chatMessages: new MemoryRepository(() => memory.chatMessages),
    systemSettings: new MemoryRepository(() => memory.systemSettings),
    auditEvents: new MemoryRepository(() => memory.auditEntries),
  };
}

// ─── Feature-flagged factory ─────────────────────────────────────────────────

function shouldUseSupabase(): boolean {
  return process.env.USE_SUPABASE === "true";
}

/**
 * Create the active repository set based on the USE_SUPABASE env var.
 *
 * - USE_SUPABASE=true  → Supabase-backed (real Postgres)
 * - USE_SUPABASE=false → In-memory (dev/demo seed data)
 *
 * Lazy-initialised to avoid import-time side-effects when the env is
 * not yet available (e.g. during build).
 */
function createRepositories(): CoreRepositories {
  if (shouldUseSupabase()) {
    // Dynamic import avoids pulling Supabase SDK into bundles that don't need it
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSupabaseRepositories } = require("./supabase-repositories");
    console.log("[MePonto] Using Supabase repositories");
    return createSupabaseRepositories();
  }

  console.log("[MePonto] Using in-memory repositories");
  return createMemoryRepositories();
}

/** Lazy singleton — created on first access. */
let _repositories: CoreRepositories | null = null;

export function getRepositories(): CoreRepositories {
  if (!_repositories) {
    _repositories = createRepositories();
  }
  return _repositories;
}

/** Convenience alias — backwards-compatible default export. */
export const repositories: CoreRepositories = new Proxy({} as CoreRepositories, {
  get(_target, prop: string) {
    return (getRepositories() as Record<string, unknown>)[prop];
  },
});

export type RepositoryServices = {
  riders: Repository<Rider>;
  rewards: Repository<RewardRule>;
  audit: Repository<AuditEvent>;
};

export const repositoryServices: RepositoryServices = {
  get riders() {
    return getRepositories().riders;
  },
  get rewards() {
    return getRepositories().rewards;
  },
  get audit() {
    return getRepositories().auditEvents;
  },
};
