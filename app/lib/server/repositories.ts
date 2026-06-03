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

export type Repository<T extends EntityWithId> = {
  all(): T[];
  findById(id: string): T | undefined;
  insert(record: T): T;
  update(id: string, patch: Partial<T>): T | undefined;
  delete(id: string): T | undefined;
  count(): number;
};

type CollectionProvider<T extends EntityWithId> = () => T[];

class MemoryRepository<T extends EntityWithId> implements Repository<T> {
  constructor(private readonly getCollection: CollectionProvider<T>) {}

  all() {
    return this.getCollection();
  }

  findById(id: string) {
    return this.getCollection().find((record) => record.id === id);
  }

  insert(record: T) {
    this.getCollection().unshift(record);
    return record;
  }

  update(id: string, patch: Partial<T>) {
    const collection = this.getCollection();
    const index = collection.findIndex((record) => record.id === id);
    if (index === -1) return undefined;

    collection[index] = { ...collection[index], ...patch };
    return collection[index];
  }

  delete(id: string) {
    const collection = this.getCollection();
    const index = collection.findIndex((record) => record.id === id);
    if (index === -1) return undefined;

    const [removed] = collection.splice(index, 1);
    return removed;
  }

  count() {
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

export const repositories = createMemoryRepositories();

export type RepositoryServices = {
  riders: Repository<Rider>;
  rewards: Repository<RewardRule>;
  audit: Repository<AuditEvent>;
};

export const repositoryServices: RepositoryServices = {
  riders: repositories.riders,
  rewards: repositories.rewards,
  audit: repositories.auditEvents,
};
