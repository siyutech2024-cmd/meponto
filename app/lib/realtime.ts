export type RealtimeEventType =
  | "Incident Alert"
  | "Rider Status"
  | "Night Shift Alert"
  | "In-App Chat Message"
  | "Finance Approval"
  | "Security Event";

export type RealtimeEvent = {
  id: string;
  type: RealtimeEventType;
  severity: "Low" | "Medium" | "High" | "Critical";
  source: string;
  title: string;
  detail: string;
  target: string;
  status: "New" | "Acknowledged" | "Routed" | "Resolved";
  createdAt: string;
};

export const realtimeEvents: RealtimeEvent[] = [
  {
    id: "rt-001",
    type: "Incident Alert",
    severity: "Critical",
    source: "Incident System",
    title: "Critical crash needs escalation",
    detail: "Felipe Rocha incident is still open in Tatuape with tow support pending.",
    target: "Regional Manager SP-East",
    status: "Routed",
    createdAt: "2026-05-15 21:48",
  },
  {
    id: "rt-002",
    type: "Night Shift Alert",
    severity: "High",
    source: "Risk Engine",
    title: "Tatuape night coverage gap",
    detail: "Night shift risk score crossed active watch threshold for Ponto Tatuape Norte.",
    target: "Ops Desk SP-East",
    status: "New",
    createdAt: "2026-05-15 21:45",
  },
  {
    id: "rt-003",
    type: "In-App Chat Message",
    severity: "Medium",
    source: "PontoSys Chat Service",
    title: "Group approval backlog",
    detail: "MePonto Tatuape Risk has pending riders waiting for Leader review.",
    target: "Marcos Lima",
    status: "Acknowledged",
    createdAt: "2026-05-15 21:40",
  },
  {
    id: "rt-004",
    type: "Finance Approval",
    severity: "Medium",
    source: "Financial Ledger",
    title: "Reward approval pending",
    detail: "New reward ledger items are waiting for Finance approval.",
    target: "Finance Ops",
    status: "New",
    createdAt: "2026-05-15 21:36",
  },
  {
    id: "rt-005",
    type: "Security Event",
    severity: "High",
    source: "Security Posture",
    title: "Blocked login from unknown VPN",
    detail: "Support Desk login was blocked and requires audit review.",
    target: "Security Ops",
    status: "Routed",
    createdAt: "2026-05-15 21:30",
  },
  {
    id: "rt-006",
    type: "Rider Status",
    severity: "Low",
    source: "Rider Online Status",
    title: "Night rider checked in",
    detail: "Andre Santos completed scheduled In-App Chat check-in for Liberdade night route.",
    target: "Ponto Liberdade Sul",
    status: "Resolved",
    createdAt: "2026-05-15 21:25",
  },
];

export function getRealtimeSummary(events: RealtimeEvent[]) {
  return {
    total: events.length,
    critical: events.filter((event) => event.severity === "Critical").length,
    high: events.filter((event) => event.severity === "High").length,
    unresolved: events.filter((event) => event.status !== "Resolved").length,
    routed: events.filter((event) => event.status === "Routed").length,
  };
}
