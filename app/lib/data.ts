export type RiderStatus = "Active" | "Inactive" | "Risk" | "Night Shift";
export type Severity = "Low" | "Medium" | "High" | "Critical";
export type IncidentStatus = "Open" | "Processing" | "Closed";
export type Rider = {
  id: string;
  name: string;
  cpf: string;
  pix: string;
  phone: string;
  bairro: string;
  ponto: string;
  leader: string;
  invitedBy: string;
  chatRoom: string;
  ar: number;
  status: RiderStatus;
  vehicleType: string;
  brand: string;
  model: string;
  rentalStatus: string;
  isMottu: boolean;
  onlineHours: number;
  nightShiftCount: number;
  incidentCount: number;
  joinDate: string;
  /** Eastwind (99Food) rider id used when reporting shift rosters. */
  ninetyNineId?: string;
};
export type Incident = {
  id: string;
  rider: string;
  ponto: string;
  severity: Severity;
  status: IncidentStatus;
  location: string;
  description: string;
  createdAt: string;
  responder: string;
};
export type LedgerStatus = "Pending" | "Approved" | "Paid" | "Rejected";
export type LedgerEntry = {
  id: string;
  recipient: string;
  recipientType: "Rider" | "Leader";
  ledgerType: "Reward" | "Leader Commission" | "PIX" | "Subsidy";
  amount: number;
  status: LedgerStatus;
  notes: string;
  createdAt: string;
};
export type Ponto = {
  id: string;
  name: string;
  bairro: string;
  ridersCount: number;
  nightShiftLevel: string;
  leader: string;
  safetyScore: number;
  lat: number;
  lng: number;
};
export type Leader = {
  id: string;
  name: string;
  phone: string;
  ponto: string;
  ridersCount: number;
  nightShiftCoverage: number;
  rating: number;
  level: string;
  joinDate: string;
  incidents: number;
};

export const pontos: Ponto[] = [
  {
    id: "p-001",
    name: "Ponto Paulista Garage",
    bairro: "Bela Vista",
    ridersCount: 84,
    nightShiftLevel: "High",
    leader: "Rafael Costa",
    safetyScore: 82,
    lat: -23.5614,
    lng: -46.6559,
  },
  {
    id: "p-002",
    name: "Ponto Liberdade Sul",
    bairro: "Liberdade",
    ridersCount: 57,
    nightShiftLevel: "Medium",
    leader: "Joao Pereira",
    safetyScore: 74,
    lat: -23.5587,
    lng: -46.6358,
  },
  {
    id: "p-003",
    name: "Ponto Tatuape Norte",
    bairro: "Tatuape",
    ridersCount: 63,
    nightShiftLevel: "Critical",
    leader: "Marcos Lima",
    safetyScore: 61,
    lat: -23.5409,
    lng: -46.5764,
  },
  {
    id: "p-004",
    name: "Ponto Pinheiros Base",
    bairro: "Pinheiros",
    ridersCount: 49,
    nightShiftLevel: "Low",
    leader: "Diego Alves",
    safetyScore: 88,
    lat: -23.5663,
    lng: -46.7019,
  },
];

export const leaders: Leader[] = [
  {
    id: "l-001",
    name: "Rafael Costa",
    phone: "+55 11 98822-1100",
    ponto: "Ponto Paulista Garage",
    ridersCount: 32,
    nightShiftCoverage: 74,
    rating: 4.8,
    level: "Elite",
    joinDate: "2025-11-08",
    incidents: 2,
  },
  {
    id: "l-002",
    name: "Joao Pereira",
    phone: "+55 11 97741-4512",
    ponto: "Ponto Liberdade Sul",
    ridersCount: 21,
    nightShiftCoverage: 56,
    rating: 4.5,
    level: "Senior",
    joinDate: "2026-01-18",
    incidents: 3,
  },
  {
    id: "l-003",
    name: "Marcos Lima",
    phone: "+55 11 96532-8801",
    ponto: "Ponto Tatuape Norte",
    ridersCount: 29,
    nightShiftCoverage: 81,
    rating: 4.7,
    level: "Elite",
    joinDate: "2025-09-27",
    incidents: 5,
  },
];

export const riders: Rider[] = [
  {
    id: "r-1001",
    name: "Carlos Mendes",
    cpf: "123.456.789-10",
    pix: "carlos.pix@meponto.br",
    phone: "+55 11 98423-9911",
    bairro: "Bela Vista",
    ponto: "Ponto Paulista Garage",
    leader: "Rafael Costa",
    invitedBy: "Rafael Costa",
    chatRoom: "MePonto Paulista 01",
    ar: 96,
    status: "Active" as RiderStatus,
    vehicleType: "Motorcycle",
    brand: "Honda",
    model: "CG 160",
    rentalStatus: "Owned",
    isMottu: false,
    onlineHours: 178,
    nightShiftCount: 14,
    incidentCount: 1,
    joinDate: "2025-12-02",
  },
  {
    id: "r-1002",
    name: "Andre Santos",
    cpf: "662.845.114-99",
    pix: "11995551234",
    phone: "+55 11 99555-1234",
    bairro: "Liberdade",
    ponto: "Ponto Liberdade Sul",
    leader: "Joao Pereira",
    invitedBy: "Carlos Mendes",
    chatRoom: "MePonto Liberdade Noite",
    ar: 88,
    status: "Night Shift" as RiderStatus,
    vehicleType: "Motorcycle",
    brand: "Yamaha",
    model: "Factor 150",
    rentalStatus: "Rental",
    isMottu: true,
    onlineHours: 203,
    nightShiftCount: 22,
    incidentCount: 0,
    joinDate: "2026-02-14",
  },
  {
    id: "r-1003",
    name: "Felipe Rocha",
    cpf: "310.097.552-31",
    pix: "felipe.rocha@email.com",
    phone: "+55 11 91277-4420",
    bairro: "Tatuape",
    ponto: "Ponto Tatuape Norte",
    leader: "Marcos Lima",
    invitedBy: "Marcos Lima",
    chatRoom: "MePonto Tatuape Risk",
    ar: 71,
    status: "Risk" as RiderStatus,
    vehicleType: "Motorcycle",
    brand: "Honda",
    model: "Fan 160",
    rentalStatus: "Rental",
    isMottu: true,
    onlineHours: 132,
    nightShiftCount: 11,
    incidentCount: 3,
    joinDate: "2026-03-05",
  },
  {
    id: "r-1004",
    name: "Mateus Oliveira",
    cpf: "921.773.044-21",
    pix: "mateus.oliveira@pix.br",
    phone: "+55 11 96740-9090",
    bairro: "Pinheiros",
    ponto: "Ponto Pinheiros Base",
    leader: "Diego Alves",
    invitedBy: "Rafael Costa",
    chatRoom: "MePonto Pinheiros 01",
    ar: 92,
    status: "Inactive" as RiderStatus,
    vehicleType: "Motorcycle",
    brand: "Honda",
    model: "Biz 125",
    rentalStatus: "Owned",
    isMottu: false,
    onlineHours: 84,
    nightShiftCount: 4,
    incidentCount: 1,
    joinDate: "2026-01-09",
  },
];

export const incidents: Incident[] = [
  {
    id: "inc-9001",
    rider: "Felipe Rocha",
    ponto: "Ponto Tatuape Norte",
    severity: "Critical" as Severity,
    status: "Open" as IncidentStatus,
    location: "Av. Celso Garcia, Tatuape",
    description: "Night shift crash reported by Leader. Rider is conscious.",
    createdAt: "2026-05-15 01:42",
    responder: "Regional Manager SP-East",
  },
  {
    id: "inc-9002",
    rider: "Carlos Mendes",
    ponto: "Ponto Paulista Garage",
    severity: "Medium" as Severity,
    status: "Processing" as IncidentStatus,
    location: "Rua Augusta, Bela Vista",
    description: "Vehicle breakdown. Tow truck requested.",
    createdAt: "2026-05-14 22:11",
    responder: "Ponto Manager Paulista",
  },
  {
    id: "inc-9003",
    rider: "Mateus Oliveira",
    ponto: "Ponto Pinheiros Base",
    severity: "Low" as Severity,
    status: "Closed" as IncidentStatus,
    location: "Largo da Batata, Pinheiros",
    description: "Minor phone loss report. Account secured.",
    createdAt: "2026-05-13 18:28",
    responder: "Support Desk",
  },
];

export const rewards = [
  { id: "rw-01", ruleName: "Night Shift Completion", points: 40, type: "Rider" },
  { id: "rw-02", ruleName: "Incident Response Under 10m", points: 80, type: "Leader" },
  { id: "rw-03", ruleName: "High AR Weekly", points: 55, type: "Rider" },
];

export const ledgerEntries: LedgerEntry[] = [
  {
    id: "led-001",
    recipient: "Andre Santos",
    recipientType: "Rider",
    ledgerType: "Reward",
    amount: 120,
    status: "Paid",
    notes: "Night shift completion bonus",
    createdAt: "2026-05-14 10:20",
  },
  {
    id: "led-002",
    recipient: "Rafael Costa",
    recipientType: "Leader",
    ledgerType: "Leader Commission",
    amount: 260,
    status: "Approved",
    notes: "Weekly team coverage commission",
    createdAt: "2026-05-14 12:05",
  },
  {
    id: "led-003",
    recipient: "Felipe Rocha",
    recipientType: "Rider",
    ledgerType: "Subsidy",
    amount: 80,
    status: "Pending",
    notes: "Accident support subsidy",
    createdAt: "2026-05-15 08:30",
  },
];
