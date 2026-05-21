export type WhatsappRiskStatus = "Stable" | "Watch" | "Risk" | "Critical";
export type WhatsappCoverageStatus = "Covered" | "Thin" | "Gap";
export type WhatsappGroup = {
  id: string;
  name: string;
  bairro: string;
  ponto: string;
  leader: string;
  leaderPhone: string;
  ridersCount: number;
  activeToday: number;
  nightCoverage: number;
  riskStatus: WhatsappRiskStatus;
  coverageStatus: WhatsappCoverageStatus;
  lastSync: string;
  pendingApprovals: number;
  unreadAlerts: number;
  broadcastList: string;
};

export const whatsappGroups: WhatsappGroup[] = [
  {
    id: "wa-001",
    name: "meponto Paulista 01",
    bairro: "Bela Vista",
    ponto: "Ponto Paulista Garage",
    leader: "Rafael Costa",
    leaderPhone: "+55 11 98822-1100",
    ridersCount: 84,
    activeToday: 71,
    nightCoverage: 74,
    riskStatus: "Stable",
    coverageStatus: "Covered",
    lastSync: "2026-05-15 07:40",
    pendingApprovals: 3,
    unreadAlerts: 1,
    broadcastList: "SP Core - Safety",
  },
  {
    id: "wa-002",
    name: "meponto Liberdade Noite",
    bairro: "Liberdade",
    ponto: "Ponto Liberdade Sul",
    leader: "Joao Pereira",
    leaderPhone: "+55 11 97741-4512",
    ridersCount: 57,
    activeToday: 39,
    nightCoverage: 56,
    riskStatus: "Watch",
    coverageStatus: "Thin",
    lastSync: "2026-05-15 06:55",
    pendingApprovals: 7,
    unreadAlerts: 4,
    broadcastList: "Night Shift - East",
  },
  {
    id: "wa-003",
    name: "meponto Tatuape Risk",
    bairro: "Tatuape",
    ponto: "Ponto Tatuape Norte",
    leader: "Marcos Lima",
    leaderPhone: "+55 11 96532-8801",
    ridersCount: 63,
    activeToday: 42,
    nightCoverage: 43,
    riskStatus: "Critical",
    coverageStatus: "Gap",
    lastSync: "2026-05-15 05:18",
    pendingApprovals: 11,
    unreadAlerts: 9,
    broadcastList: "Incident Escalation",
  },
  {
    id: "wa-004",
    name: "meponto Pinheiros 01",
    bairro: "Pinheiros",
    ponto: "Ponto Pinheiros Base",
    leader: "Diego Alves",
    leaderPhone: "+55 11 96740-9090",
    ridersCount: 49,
    activeToday: 44,
    nightCoverage: 82,
    riskStatus: "Stable",
    coverageStatus: "Covered",
    lastSync: "2026-05-15 07:22",
    pendingApprovals: 1,
    unreadAlerts: 0,
    broadcastList: "West Operations",
  },
  {
    id: "wa-005",
    name: "meponto Centro Intake",
    bairro: "Republica",
    ponto: "Ponto Centro Intake",
    leader: "Camila Nunes",
    leaderPhone: "+55 11 97610-3344",
    ridersCount: 36,
    activeToday: 18,
    nightCoverage: 39,
    riskStatus: "Risk",
    coverageStatus: "Gap",
    lastSync: "2026-05-14 23:50",
    pendingApprovals: 14,
    unreadAlerts: 6,
    broadcastList: "New Rider Intake",
  },
];
