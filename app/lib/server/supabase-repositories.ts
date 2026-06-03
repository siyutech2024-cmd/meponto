/**
 * Supabase-backed repository implementations.
 *
 * Each repository maps a Supabase table to the application-level TypeScript
 * interface, converting between snake_case DB columns and camelCase app fields.
 *
 * Feature-flagged via USE_SUPABASE env var.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repository, EntityWithId, CoreRepositories, AuditEvent } from "./repositories";
import type { Rider, Incident, Ponto, Leader, LedgerEntry } from "../data";
import type { CrmPartner } from "../crm";
import type { NotificationItem } from "../notifications";
import type { SystemSetting } from "../settings";
import type { ChatMessage, ChatRoom } from "../chat";
import { rewards as seedRewards } from "../data";
import { getSupabaseServerClient } from "../supabase/server";

type RewardRule = (typeof seedRewards)[number];

// ─── Field mappers ───────────────────────────────────────────────────────────

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function mapRowToEntity<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[snakeToCamel(k)] = v;
  }
  return out as T;
}

function mapEntityToRow(entity: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entity)) {
    if (v !== undefined) {
      out[camelToSnake(k)] = v;
    }
  }
  return out;
}

// ─── Generic Supabase Repository ─────────────────────────────────────────────

class SupabaseRepository<T extends EntityWithId> {
  constructor(
    private readonly tableName: string,
    private readonly client: SupabaseClient,
    private readonly idColumn: string = "id",
    /** Optional extra field-level post-processing */
    private readonly postMap?: (row: Record<string, unknown>) => T,
  ) {}

  async all(): Promise<T[]> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`[Supabase] ${this.tableName}.all() error:`, error.message);
      return [];
    }

    return (data ?? []).map((row) =>
      this.postMap ? this.postMap(row) : mapRowToEntity<T>(row),
    );
  }

  async findById(id: string): Promise<T | undefined> {
    const { data, error } = await this.client
      .from(this.tableName)
      .select("*")
      .eq(this.idColumn, id)
      .maybeSingle();

    if (error || !data) return undefined;
    return this.postMap ? this.postMap(data) : mapRowToEntity<T>(data);
  }

  async insert(record: T): Promise<T> {
    const row = mapEntityToRow(record as unknown as Record<string, unknown>);
    const { data, error } = await this.client
      .from(this.tableName)
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error(`[Supabase] ${this.tableName}.insert() error:`, error.message);
      return record;
    }

    return this.postMap ? this.postMap(data) : mapRowToEntity<T>(data);
  }

  async update(id: string, patch: Partial<T>): Promise<T | undefined> {
    const row = mapEntityToRow(patch as unknown as Record<string, unknown>);
    const { data, error } = await this.client
      .from(this.tableName)
      .update(row)
      .eq(this.idColumn, id)
      .select()
      .single();

    if (error || !data) return undefined;
    return this.postMap ? this.postMap(data) : mapRowToEntity<T>(data);
  }

  async delete(id: string): Promise<T | undefined> {
    const { data, error } = await this.client
      .from(this.tableName)
      .delete()
      .eq(this.idColumn, id)
      .select()
      .single();

    if (error || !data) return undefined;
    return this.postMap ? this.postMap(data) : mapRowToEntity<T>(data);
  }

  async count(): Promise<number> {
    const { count, error } = await this.client
      .from(this.tableName)
      .select("*", { count: "exact", head: true });

    if (error) return 0;
    return count ?? 0;
  }
}

// ─── Entity-specific post-mappers ────────────────────────────────────────────
// These handle fields whose DB column names don't follow a simple snake_case pattern,
// or need type coercion.

function mapRiderRow(row: Record<string, unknown>): Rider {
  const base = mapRowToEntity<Rider>(row);
  // Map foreign-key names stored as separate columns
  return {
    ...base,
    id: (row.external_id as string) ?? (row.id as string),
  };
}

function mapPontoRow(row: Record<string, unknown>): Ponto {
  const base = mapRowToEntity<Ponto>(row);
  return {
    ...base,
    id: (row.external_id as string) ?? (row.id as string),
    lat: Number(row.lat ?? 0),
    lng: Number(row.lng ?? 0),
  };
}

function mapLeaderRow(row: Record<string, unknown>): Leader {
  const base = mapRowToEntity<Leader>(row);
  return {
    ...base,
    id: (row.external_id as string) ?? (row.id as string),
    rating: Number(row.rating ?? 0),
  };
}

function mapIncidentRow(row: Record<string, unknown>): Incident {
  const base = mapRowToEntity<Incident>(row);
  return {
    ...base,
    id: (row.external_id as string) ?? (row.id as string),
    rider: (row.rider_name as string) ?? "",
    ponto: (row.ponto_name as string) ?? "",
    responder: (row.responder_name as string) ?? "",
    createdAt: (row.created_at as string)?.slice(0, 16).replace("T", " ") ?? "",
  };
}

function mapLedgerRow(row: Record<string, unknown>): LedgerEntry {
  const base = mapRowToEntity<LedgerEntry>(row);
  return {
    ...base,
    id: (row.external_id as string) ?? (row.id as string),
    recipient: (row.recipient_name as string) ?? "",
    amount: ((row.amount_cents as number) ?? 0) / 100,
    createdAt: (row.created_at as string)?.slice(0, 16).replace("T", " ") ?? "",
  };
}

function mapAuditRow(row: Record<string, unknown>): AuditEvent {
  return {
    id: (row.external_id as string) ?? (row.id as string),
    actor: (row.actor_name as string) ?? "",
    action: (row.action as string) ?? "",
    entity: (row.entity as string) ?? "",
    entityId: (row.entity_id as string) ?? "",
    detail: (row.detail as string) ?? "",
    risk: (row.risk as "Low" | "Medium" | "High") ?? "Low",
    createdAt: (row.created_at as string)?.slice(0, 16).replace("T", " ") ?? "",
  };
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createSupabaseRepositories(): CoreRepositories {
  const client = getSupabaseServerClient();

  return {
    riders: new SupabaseRepository<Rider>("riders", client, "id", mapRiderRow) as unknown as Repository<Rider>,
    incidents: new SupabaseRepository<Incident>("incidents", client, "id", mapIncidentRow) as unknown as Repository<Incident>,
    pontos: new SupabaseRepository<Ponto>("pontos", client, "id", mapPontoRow) as unknown as Repository<Ponto>,
    leaders: new SupabaseRepository<Leader>("leaders", client, "id", mapLeaderRow) as unknown as Repository<Leader>,
    rewards: new SupabaseRepository<RewardRule>("rewards", client) as unknown as Repository<RewardRule>,
    ledgerEntries: new SupabaseRepository<LedgerEntry>("ledger_entries", client, "id", mapLedgerRow) as unknown as Repository<LedgerEntry>,
    notifications: new SupabaseRepository<NotificationItem>("notifications", client) as unknown as Repository<NotificationItem>,
    crmPartners: new SupabaseRepository<CrmPartner>("crm_partners", client) as unknown as Repository<CrmPartner>,
    chatRooms: new SupabaseRepository<ChatRoom>("chat_rooms", client) as unknown as Repository<ChatRoom>,
    chatMessages: new SupabaseRepository<ChatMessage>("chat_messages", client) as unknown as Repository<ChatMessage>,
    systemSettings: new SupabaseRepository<SystemSetting>("settings", client) as unknown as Repository<SystemSetting>,
    auditEvents: new SupabaseRepository<AuditEvent>("audit_logs", client, "id", mapAuditRow) as unknown as Repository<AuditEvent>,
  };
}
