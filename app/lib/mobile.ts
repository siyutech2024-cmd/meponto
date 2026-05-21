export type MobileRole = "Leader" | "Rider";
export type MobileWorkflowStatus = "Ready" | "Queued" | "Escalated" | "Resolved" | "Watching";
export type MobileNightStatus = "Online" | "Break" | "Support" | "Offline";

export type MobileWorkflow = {
  id: string;
  role: MobileRole;
  title: string;
  channel: "Android" | "WhatsApp" | "Android + WhatsApp";
  status: MobileWorkflowStatus;
  primaryAction: string;
  responseTarget: string;
  detail: string;
};

export type MobileRosterMember = {
  id: string;
  name: string;
  role: MobileRole;
  ponto: string;
  phone: string;
  batteryPct: number;
  nightStatus: MobileNightStatus;
  lastSeen: string;
};

export type MobileIncidentDraft = {
  id: string;
  rider: string;
  category: "Crash" | "Police Stop" | "Robbery Risk" | "Mechanical";
  severity: "Low" | "Medium" | "High" | "Critical";
  location: string;
  submittedVia: "WhatsApp" | "Android";
  etaToHuman: string;
};

export type MobileEmergencyLane = {
  id: string;
  label: string;
  target: string;
  status: MobileWorkflowStatus;
  nextStep: string;
};

export type MobilePayload = {
  generatedAt: string;
  summary: {
    androidSessions: number;
    whatsappSessions: number;
    checkInsToday: number;
    openMobileIncidents: number;
    emergencyResponseTarget: string;
    nightShiftOnline: number;
  };
  workflows: MobileWorkflow[];
  roster: MobileRosterMember[];
  incidentDrafts: MobileIncidentDraft[];
  emergencyLanes: MobileEmergencyLane[];
};

export const mobileWorkflows: MobileWorkflow[] = [
  {
    id: "mw-checkin",
    role: "Rider",
    title: "Shift Check-in",
    channel: "Android + WhatsApp",
    status: "Ready",
    primaryAction: "Send GPS + selfie check",
    responseTarget: "under 30 sec",
    detail: "Rider confirms ponto, vehicle, battery, and WhatsApp reachability before going online.",
  },
  {
    id: "mw-incident",
    role: "Rider",
    title: "Incident Submit",
    channel: "WhatsApp",
    status: "Queued",
    primaryAction: "Attach voice note + location",
    responseTarget: "under 2 min",
    detail: "Low-bandwidth incident intake converts chat context into an operator-ready case.",
  },
  {
    id: "mw-emergency",
    role: "Leader",
    title: "Emergency Support",
    channel: "Android + WhatsApp",
    status: "Escalated",
    primaryAction: "Open SOS bridge",
    responseTarget: "under 60 sec",
    detail: "Leader triggers a human support lane, shares rider location, and keeps WhatsApp fallback active.",
  },
  {
    id: "mw-roster",
    role: "Leader",
    title: "Team Roster",
    channel: "Android",
    status: "Watching",
    primaryAction: "Review riders needing contact",
    responseTarget: "live",
    detail: "Leader sees who is online, reachable, on break, or missing from the night shift.",
  },
  {
    id: "mw-night",
    role: "Leader",
    title: "Night Shift Status",
    channel: "WhatsApp",
    status: "Ready",
    primaryAction: "Broadcast safety pulse",
    responseTarget: "every 30 min",
    detail: "Compact night shift heartbeat for route safety, breaks, and risk zone awareness.",
  },
];

export const mobileRoster: MobileRosterMember[] = [
  {
    id: "mr-001",
    name: "Andre Santos",
    role: "Rider",
    ponto: "Ponto Liberdade Sul",
    phone: "+55 11 99555-1234",
    batteryPct: 82,
    nightStatus: "Online",
    lastSeen: "2026-05-15 02:22",
  },
  {
    id: "mr-002",
    name: "Felipe Rocha",
    role: "Rider",
    ponto: "Ponto Tatuape Norte",
    phone: "+55 11 91277-4420",
    batteryPct: 41,
    nightStatus: "Support",
    lastSeen: "2026-05-15 02:19",
  },
  {
    id: "mr-003",
    name: "Joao Pereira",
    role: "Leader",
    ponto: "Ponto Liberdade Sul",
    phone: "+55 11 97741-4512",
    batteryPct: 67,
    nightStatus: "Online",
    lastSeen: "2026-05-15 02:24",
  },
  {
    id: "mr-004",
    name: "Mateus Oliveira",
    role: "Rider",
    ponto: "Ponto Pinheiros Base",
    phone: "+55 11 96740-9090",
    batteryPct: 28,
    nightStatus: "Break",
    lastSeen: "2026-05-15 02:03",
  },
];

export const mobileIncidentDrafts: MobileIncidentDraft[] = [
  {
    id: "mid-001",
    rider: "Felipe Rocha",
    category: "Crash",
    severity: "Critical",
    location: "Av. Celso Garcia, Tatuape",
    submittedVia: "WhatsApp",
    etaToHuman: "00:42",
  },
  {
    id: "mid-002",
    rider: "Andre Santos",
    category: "Police Stop",
    severity: "Medium",
    location: "Rua Galvao Bueno, Liberdade",
    submittedVia: "Android",
    etaToHuman: "01:18",
  },
  {
    id: "mid-003",
    rider: "Mateus Oliveira",
    category: "Mechanical",
    severity: "Low",
    location: "Av. Reboucas, Pinheiros",
    submittedVia: "WhatsApp",
    etaToHuman: "04:30",
  },
];

export const mobileEmergencyLanes: MobileEmergencyLane[] = [
  {
    id: "mel-001",
    label: "SOS Human Bridge",
    target: "Operator + Leader + Rider",
    status: "Escalated",
    nextStep: "Confirm ambulance need and keep WhatsApp audio open.",
  },
  {
    id: "mel-002",
    label: "Safe Stop Check",
    target: "Night shift riders in Tatuape",
    status: "Watching",
    nextStep: "Ask riders to confirm safe stop before next delivery.",
  },
  {
    id: "mel-003",
    label: "Return-to-route",
    target: "Resolved incident riders",
    status: "Ready",
    nextStep: "Leader clears vehicle status and final rider check-in.",
  },
];

export function getMobilePayload(): MobilePayload {
  const androidSessions = mobileWorkflows.filter((workflow) => workflow.channel.includes("Android")).length;
  const whatsappSessions = mobileWorkflows.filter((workflow) => workflow.channel.includes("WhatsApp")).length;
  const nightShiftOnline = mobileRoster.filter((member) => member.nightStatus === "Online" || member.nightStatus === "Support").length;

  return {
    generatedAt: "2026-05-15 02:25",
    summary: {
      androidSessions,
      whatsappSessions,
      checkInsToday: 118,
      openMobileIncidents: mobileIncidentDrafts.filter((incident) => incident.severity !== "Low").length,
      emergencyResponseTarget: "under 60 sec",
      nightShiftOnline,
    },
    workflows: mobileWorkflows,
    roster: mobileRoster,
    incidentDrafts: mobileIncidentDrafts,
    emergencyLanes: mobileEmergencyLanes,
  };
}
