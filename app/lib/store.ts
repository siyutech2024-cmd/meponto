"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  incidents as seedIncidents,
  leaders as seedLeaders,
  ledgerEntries as seedLedgerEntries,
  pontos as seedPontos,
  rewards as seedRewards,
  riders as seedRiders,
  type Incident,
  type IncidentStatus,
  type Leader,
  type LedgerEntry,
  type LedgerStatus,
  type Ponto,
  type Rider,
  type RiderStatus,
  type Severity,
} from "./data";
import { notificationFromIncident, seedNotificationsFromIncidents, type NotificationItem } from "./notifications";
import type { Language } from "./i18n";
import type { Role } from "./rbac";
import { syncToServer } from "./sync";

export type ThemeMode = "dark" | "light";
type RiderInput = Pick<Rider, "name" | "cpf" | "phone" | "pix" | "bairro" | "ponto" | "leader" | "status"> &
  Partial<Pick<Rider, "franchise" | "ninetyNineId" | "birthday">>;
export type RiderUpdate = Partial<
  Pick<
    Rider,
    | "name"
    | "cpf"
    | "phone"
    | "pix"
    | "bairro"
    | "ponto"
    | "leader"
    | "status"
    | "vehicleType"
    | "brand"
    | "model"
    | "rentalStatus"
    | "isMottu"
    | "chatRoom"
  >
>;
type PontoInput = Pick<Ponto, "name" | "bairro" | "ridersCount" | "nightShiftLevel" | "leader" | "safetyScore" | "lat" | "lng">;
type LeaderInput = Pick<Leader, "name" | "phone" | "ponto" | "ridersCount" | "nightShiftCoverage" | "rating" | "level">;
type IncidentInput = Pick<Incident, "rider" | "ponto" | "severity" | "location" | "description">;
type LedgerInput = Pick<LedgerEntry, "recipient" | "recipientType" | "ledgerType" | "amount" | "notes">;
export type RewardRule = {
  id: string;
  ruleName: string;
  points: number;
  type: "Rider" | "Leader";
};
type RewardRuleInput = Pick<RewardRule, "ruleName" | "points" | "type">;
export type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  detail: string;
  createdAt: string;
  risk: "Low" | "Medium" | "High";
};

type VentoState = {
  language: Language;
  theme: ThemeMode;
  currentRole: Role;
  riders: Rider[];
  pontos: Ponto[];
  leaders: Leader[];
  incidents: Incident[];
  rewardRules: RewardRule[];
  ledgerEntries: LedgerEntry[];
  notifications: NotificationItem[];
  auditLog: AuditEntry[];
  setLanguage: (language: Language) => void;
  setTheme: (theme: ThemeMode) => void;
  setRole: (role: Role) => void;
  addRider: (input: RiderInput) => void;
  addPonto: (input: PontoInput) => void;
  addLeader: (input: LeaderInput) => void;
  updateRider: (id: string, patch: RiderUpdate, action?: string) => void;
  updateRiderStatus: (id: string, status: RiderStatus) => void;
  addIncident: (input: IncidentInput) => void;
  updateIncidentStatus: (id: string, status: IncidentStatus) => void;
  recordIncidentResponse: (id: string, action: string, detail: string, status?: IncidentStatus) => void;
  addRewardRule: (input: RewardRuleInput) => void;
  updateRewardRule: (id: string, input: RewardRuleInput) => void;
  addLedgerEntry: (input: LedgerInput) => void;
  updateLedgerStatus: (id: string, status: LedgerStatus) => void;
  markNotificationRead: (id: string) => void;
  acknowledgeNotification: (id: string) => void;
  resetDemoData: () => void;
};

function makeId(prefix: string, count: number) {
  return `${prefix}-${String(Date.now()).slice(-5)}${count}`;
}

function makeAudit(action: string, entity: string, entityId: string, detail: string, risk: AuditEntry["risk"] = "Low"): AuditEntry {
  const entry: AuditEntry = {
    id: makeId("aud", Math.round(Math.random() * 1000)),
    actor: "Super Admin",
    action,
    entity,
    entityId,
    detail,
    risk,
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  };

  // Mirror the audit event to the server so it reaches the database.
  syncToServer("/api/audit", "POST", entry);
  return entry;
}

const seedAuditLog: AuditEntry[] = [
  {
    id: "aud-001",
    actor: "System",
    action: "BOOTSTRAP",
    entity: "Workspace",
    entityId: "pontosys",
    detail: "Demo operating dataset initialized",
    risk: "Low",
    createdAt: "2026-05-15 17:36",
  },
];

export const useVentoStore = create<VentoState>()(
  persist(
    (set, get) => ({
      language: "en",
      theme: "dark",
      currentRole: "Super Admin",
      riders: seedRiders,
      pontos: seedPontos,
      leaders: seedLeaders,
      incidents: seedIncidents,
      rewardRules: seedRewards as RewardRule[],
      ledgerEntries: seedLedgerEntries,
      notifications: seedNotificationsFromIncidents(seedIncidents),
      auditLog: seedAuditLog,
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setRole: (role) =>
        set((state) => ({
          currentRole: role,
          auditLog: [makeAudit("SWITCH_ROLE", "Session", "current-user", `Current role changed to ${role}`, "Low"), ...state.auditLog],
        })),
      addRider: (input) => {
        const rider: Rider = {
          id: makeId("r", get().riders.length + 1),
          name: input.name,
          cpf: input.cpf,
          phone: input.phone,
          pix: input.pix,
          bairro: input.bairro,
          ponto: input.ponto,
          leader: input.leader,
          invitedBy: "MePonto Admin",
          chatRoom: `MePonto ${input.bairro}`,
          ar: 100,
          status: input.status,
          vehicleType: "Motorcycle",
          brand: "Unknown",
          model: "To confirm",
          rentalStatus: "Unknown",
          isMottu: false,
          onlineHours: 0,
          nightShiftCount: input.status === "Night Shift" ? 1 : 0,
          incidentCount: 0,
          joinDate: new Date().toISOString().slice(0, 10),
          franchise: input.franchise || "Unassigned",
          ninetyNineId: input.ninetyNineId || "",
          birthday: input.birthday || "",
        };

        set((state) => ({
          riders: [rider, ...state.riders],
          auditLog: [
            makeAudit("CREATE_RIDER", "Rider", rider.id, `${rider.name} added to ${rider.ponto}`, "Low"),
            ...state.auditLog,
          ],
        }));

        syncToServer("/api/riders", "POST", rider);
      },
      addPonto: (input) => {
        const ponto: Ponto = {
          id: makeId("p", get().pontos.length + 1),
          name: input.name,
          bairro: input.bairro,
          ridersCount: input.ridersCount,
          nightShiftLevel: input.nightShiftLevel,
          leader: input.leader || "Unassigned",
          safetyScore: input.safetyScore,
          lat: input.lat,
          lng: input.lng,
        };

        set((state) => ({
          pontos: [ponto, ...state.pontos],
          auditLog: [
            makeAudit("CREATE_PONTO", "Ponto", ponto.id, `${ponto.name} opened in ${ponto.bairro}`, "Low"),
            ...state.auditLog,
          ],
        }));

        syncToServer("/api/pontos", "POST", ponto);
      },
      addLeader: (input) => {
        const leader: Leader = {
          id: makeId("l", get().leaders.length + 1),
          name: input.name,
          phone: input.phone,
          ponto: input.ponto,
          ridersCount: input.ridersCount,
          nightShiftCoverage: input.nightShiftCoverage,
          rating: input.rating,
          level: input.level,
          joinDate: new Date().toISOString().slice(0, 10),
          incidents: 0,
        };

        const affectedPontos = get().pontos.filter((ponto) => ponto.name === leader.ponto);

        set((state) => ({
          leaders: [leader, ...state.leaders],
          pontos: state.pontos.map((ponto) => (ponto.name === leader.ponto ? { ...ponto, leader: leader.name } : ponto)),
          auditLog: [
            makeAudit("CREATE_LEADER", "Leader", leader.id, `${leader.name} assigned to ${leader.ponto}`, "Low"),
            ...state.auditLog,
          ],
        }));

        syncToServer("/api/leaders", "POST", leader);
        for (const ponto of affectedPontos) {
          syncToServer(`/api/pontos/${ponto.id}`, "PUT", { leader: leader.name });
        }
      },
      updateRider: (id, patch, action = "UPDATE_RIDER") => {
        const rider = get().riders.find((item) => item.id === id);
        if (!rider) return;

        const updated = { ...rider, ...patch };
        const affectedIncidents = get().incidents.filter((incident) => incident.rider === rider.name);

        set((state) => ({
          riders: state.riders.map((item) => (item.id === id ? updated : item)),
          incidents: state.incidents.map((incident) =>
            incident.rider === rider.name
              ? {
                  ...incident,
                  rider: updated.name,
                  ponto: updated.ponto,
                }
              : incident,
          ),
          auditLog: [
            makeAudit(action, "Rider", id, `${rider.name} updated`, patch.status === "Risk" ? "Medium" : "Low"),
            ...state.auditLog,
          ],
        }));

        syncToServer(`/api/riders/${id}`, "PUT", patch);
        for (const incident of affectedIncidents) {
          syncToServer(`/api/incidents/${incident.id}`, "PUT", { rider: updated.name, ponto: updated.ponto });
        }
      },
      updateRiderStatus: (id, status) => {
        set((state) => {
          const rider = state.riders.find((item) => item.id === id);
          return {
            riders: state.riders.map((item) => (item.id === id ? { ...item, status } : item)),
            auditLog: rider
              ? [
                  makeAudit("UPDATE_RIDER_STATUS", "Rider", id, `${rider.name} moved from ${rider.status} to ${status}`, status === "Risk" ? "Medium" : "Low"),
                  ...state.auditLog,
                ]
              : state.auditLog,
          };
        });

        syncToServer(`/api/riders/${id}`, "PUT", { status });
      },
      addIncident: (input) => {
        const rider = get().riders.find((item) => item.name === input.rider);
        const incident: Incident = {
          id: makeId("inc", get().incidents.length + 1),
          rider: input.rider,
          ponto: input.ponto,
          severity: input.severity as Severity,
          status: "Open",
          location: input.location,
          description: input.description,
          createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
          responder: "MePonto Ops Desk",
        };
        const notification = notificationFromIncident(incident);

        set((state) => ({
          incidents: [incident, ...state.incidents],
          notifications: [notification, ...state.notifications],
          riders: rider
            ? state.riders.map((item) => (item.id === rider.id ? { ...item, incidentCount: item.incidentCount + 1, status: "Risk" } : item))
            : state.riders,
          auditLog: [
            makeAudit("CREATE_INCIDENT", "Incident", incident.id, `${incident.severity} incident opened for ${incident.rider}`, incident.severity === "Critical" ? "High" : "Medium"),
            ...state.auditLog,
          ],
        }));

        syncToServer("/api/incidents", "POST", incident);
        syncToServer("/api/notifications", "POST", notification);
        if (rider) {
          syncToServer(`/api/riders/${rider.id}`, "PUT", { incidentCount: rider.incidentCount + 1, status: "Risk" });
        }
      },
      updateIncidentStatus: (id, status) => {
        set((state) => {
          const incident = state.incidents.find((item) => item.id === id);
          return {
            incidents: state.incidents.map((item) => (item.id === id ? { ...item, status } : item)),
            auditLog: incident
              ? [
                  makeAudit("UPDATE_INCIDENT_STATUS", "Incident", id, `${incident.id} moved from ${incident.status} to ${status}`, status === "Closed" ? "Low" : "Medium"),
                  ...state.auditLog,
                ]
              : state.auditLog,
          };
        });

        syncToServer(`/api/incidents/${id}`, "PUT", { status });
      },
      recordIncidentResponse: (id, action, detail, status) => {
        const incident = get().incidents.find((item) => item.id === id);
        if (!incident) return;

        const nextStatus = status ?? incident.status;
        set((state) => ({
          incidents: state.incidents.map((item) => (item.id === id ? { ...item, status: nextStatus } : item)),
          auditLog: [
            makeAudit(action, "Incident", id, detail, nextStatus === "Closed" ? "Low" : "Medium"),
            ...state.auditLog,
          ],
        }));

        syncToServer(`/api/incidents/${id}`, "PUT", { status: nextStatus });
      },
      addRewardRule: (input) => {
        const rule: RewardRule = {
          id: makeId("rw", get().rewardRules.length + 1),
          ruleName: input.ruleName,
          points: input.points,
          type: input.type,
        };

        set((state) => ({
          rewardRules: [rule, ...state.rewardRules],
          auditLog: [
            makeAudit("CREATE_REWARD_RULE", "RewardRule", rule.id, `${rule.ruleName} rule created for ${rule.type}`, "Low"),
            ...state.auditLog,
          ],
        }));

        syncToServer("/api/rewards", "POST", rule);
      },
      updateRewardRule: (id, input) => {
        set((state) => {
          const rule = state.rewardRules.find((item) => item.id === id);
          return {
            rewardRules: state.rewardRules.map((item) => (item.id === id ? { ...item, ...input } : item)),
            auditLog: rule
              ? [
                  makeAudit("UPDATE_REWARD_RULE", "RewardRule", id, `${rule.ruleName} updated to ${input.points} points for ${input.type}`, "Low"),
                  ...state.auditLog,
                ]
              : state.auditLog,
          };
        });

        syncToServer(`/api/rewards/${id}`, "PUT", input);
      },
      addLedgerEntry: (input) => {
        const entry: LedgerEntry = {
          id: makeId("led", get().ledgerEntries.length + 1),
          recipient: input.recipient,
          recipientType: input.recipientType,
          ledgerType: input.ledgerType,
          amount: input.amount,
          status: "Pending",
          notes: input.notes,
          createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
        };

        set((state) => ({
          ledgerEntries: [entry, ...state.ledgerEntries],
          auditLog: [
            makeAudit("CREATE_LEDGER_ENTRY", "Ledger", entry.id, `${entry.ledgerType} R$ ${entry.amount} created for ${entry.recipient}`, "Medium"),
            ...state.auditLog,
          ],
        }));

        syncToServer("/api/finance", "POST", entry);
      },
      updateLedgerStatus: (id, status) => {
        set((state) => {
          const entry = state.ledgerEntries.find((item) => item.id === id);
          return {
            ledgerEntries: state.ledgerEntries.map((item) => (item.id === id ? { ...item, status } : item)),
            auditLog: entry
              ? [
                  makeAudit("UPDATE_LEDGER_STATUS", "Ledger", id, `${entry.id} moved from ${entry.status} to ${status}`, status === "Rejected" ? "High" : "Medium"),
                  ...state.auditLog,
                ]
              : state.auditLog,
          };
        });

        syncToServer(`/api/finance/${id}`, "PUT", { status });
      },
      markNotificationRead: (id) => {
        const target = get().notifications.find((item) => item.id === id);
        set((state) => ({
          notifications: state.notifications.map((notification) =>
            notification.id === id && !notification.readAt
              ? { ...notification, readAt: new Date().toISOString().slice(0, 16).replace("T", " ") }
              : notification,
          ),
        }));

        if (target && !target.readAt) {
          syncToServer("/api/notifications", "PUT", { id, status: "read" });
        }
      },
      acknowledgeNotification: (id) => {
        const notification = get().notifications.find((item) => item.id === id);
        if (!notification || notification.acknowledgedAt) return;

        const acknowledgedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
        set((state) => ({
          notifications: state.notifications.map((item) =>
            item.id === id ? { ...item, readAt: item.readAt ?? acknowledgedAt, acknowledgedAt } : item,
          ),
          auditLog: [
            makeAudit("ACK_NOTIFICATION", "Notification", id, `${notification.title} acknowledged`, "Low"),
            ...state.auditLog,
          ],
        }));

        syncToServer("/api/notifications", "PUT", { id, status: "acknowledged" });
      },
      resetDemoData: () => {
        syncToServer("/api/demo/reset", "POST");
        set({
          riders: seedRiders,
          pontos: seedPontos,
          leaders: seedLeaders,
          incidents: seedIncidents,
          rewardRules: seedRewards as RewardRule[],
          ledgerEntries: seedLedgerEntries,
          notifications: seedNotificationsFromIncidents(seedIncidents),
          auditLog: [makeAudit("RESET_DEMO_DATA", "Workspace", "pontosys", "Demo data restored to seed state", "Medium"), ...seedAuditLog],
        });
      },
    }),
    {
      name: "pontosys-store",
    },
  ),
);
