export type ChatRiskStatus = "Stable" | "Watch" | "Risk" | "Critical";
export type ChatCoverageStatus = "Covered" | "Thin" | "Gap";
export type ChatRoom = {
  id: string;
  name: string;
  bairro: string;
  ponto: string;
  leader: string;
  leaderPhone: string;
  ridersCount: number;
  activeToday: number;
  nightCoverage: number;
  riskStatus: ChatRiskStatus;
  coverageStatus: ChatCoverageStatus;
  lastActivity: string;
  pendingApprovals: number;
  unreadAlerts: number;
  broadcastList: string;
};

export type ChatMessage = {
  id: string;
  roomId: string;
  sender: string;
  senderRole: "HQ" | "Leader" | "Rider" | "Support";
  body: string;
  createdAt: string;
  status: "Delivered" | "Read" | "Action Required";
};

export const chatRooms: ChatRoom[] = [
  {
    id: "chat-001",
    name: "MePonto Paulista 01",
    bairro: "Bela Vista",
    ponto: "Ponto Paulista Garage",
    leader: "Rafael Costa",
    leaderPhone: "+55 11 98822-1100",
    ridersCount: 84,
    activeToday: 71,
    nightCoverage: 74,
    riskStatus: "Stable",
    coverageStatus: "Covered",
    lastActivity: "2026-05-15 07:40",
    pendingApprovals: 3,
    unreadAlerts: 1,
    broadcastList: "SP Core - Safety",
  },
  {
    id: "chat-002",
    name: "MePonto Liberdade Noite",
    bairro: "Liberdade",
    ponto: "Ponto Liberdade Sul",
    leader: "Joao Pereira",
    leaderPhone: "+55 11 97741-4512",
    ridersCount: 57,
    activeToday: 39,
    nightCoverage: 56,
    riskStatus: "Watch",
    coverageStatus: "Thin",
    lastActivity: "2026-05-15 06:55",
    pendingApprovals: 7,
    unreadAlerts: 4,
    broadcastList: "Night Shift - East",
  },
  {
    id: "chat-003",
    name: "MePonto Tatuape Risk",
    bairro: "Tatuape",
    ponto: "Ponto Tatuape Norte",
    leader: "Marcos Lima",
    leaderPhone: "+55 11 96532-8801",
    ridersCount: 63,
    activeToday: 42,
    nightCoverage: 43,
    riskStatus: "Critical",
    coverageStatus: "Gap",
    lastActivity: "2026-05-15 05:18",
    pendingApprovals: 11,
    unreadAlerts: 9,
    broadcastList: "Incident Escalation",
  },
  {
    id: "chat-004",
    name: "MePonto Pinheiros 01",
    bairro: "Pinheiros",
    ponto: "Ponto Pinheiros Base",
    leader: "Diego Alves",
    leaderPhone: "+55 11 96740-9090",
    ridersCount: 49,
    activeToday: 44,
    nightCoverage: 82,
    riskStatus: "Stable",
    coverageStatus: "Covered",
    lastActivity: "2026-05-15 07:22",
    pendingApprovals: 1,
    unreadAlerts: 0,
    broadcastList: "West Operations",
  },
  {
    id: "chat-005",
    name: "MePonto Centro Intake",
    bairro: "Republica",
    ponto: "Ponto Centro Intake",
    leader: "Camila Nunes",
    leaderPhone: "+55 11 97610-3344",
    ridersCount: 36,
    activeToday: 18,
    nightCoverage: 39,
    riskStatus: "Risk",
    coverageStatus: "Gap",
    lastActivity: "2026-05-14 23:50",
    pendingApprovals: 14,
    unreadAlerts: 6,
    broadcastList: "New Rider Intake",
  },
];

export const chatMessages: ChatMessage[] = [
  {
    id: "msg-001",
    roomId: "chat-003",
    sender: "Ops Desk SP-East",
    senderRole: "HQ",
    body: "Confirm the riders available for the Tatuape night safety pulse.",
    createdAt: "2026-05-15 21:42",
    status: "Action Required",
  },
  {
    id: "msg-002",
    roomId: "chat-003",
    sender: "Marcos Lima",
    senderRole: "Leader",
    body: "42 riders online. Three riders need a battery and location recheck.",
    createdAt: "2026-05-15 21:45",
    status: "Read",
  },
  {
    id: "msg-003",
    roomId: "chat-003",
    sender: "Support Desk",
    senderRole: "Support",
    body: "Incident escalation lane is open inside PontoSys. Use the SOS action for critical cases.",
    createdAt: "2026-05-15 21:47",
    status: "Delivered",
  },
];
