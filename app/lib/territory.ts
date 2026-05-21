import { incidents, pontos, riders } from "./data";

export type TerritoryRisk = "Low" | "Medium" | "High" | "Critical";

export type TerritoryAssignment = {
  owner: string;
  shift: "Day" | "Night" | "Mixed";
  channel: string;
  status: "Covered" | "Watch" | "Rebalance";
};

export type TerritoryZone = {
  id: string;
  bairro: string;
  label: string;
  coverage: number;
  density: number;
  nightRisk: TerritoryRisk;
  nightRiskScore: number;
  pontoIds: string[];
  assignment: TerritoryAssignment;
  map: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type TerritoryMetrics = {
  pontos: number;
  bairros: number;
  coveredBairros: number;
  riders: number;
  nightRiders: number;
  avgCoverage: number;
  avgDensity: number;
  criticalZones: number;
  openIncidents: number;
};

const zoneBlueprints = [
  {
    id: "tz-paulista",
    bairro: "Bela Vista",
    label: "Paulista Core",
    coverage: 92,
    map: { x: 28, y: 28, width: 24, height: 26 },
    assignment: {
      owner: "Rafael Costa",
      shift: "Mixed" as const,
      channel: "meponto Paulista 01",
      status: "Covered" as const,
    },
  },
  {
    id: "tz-liberdade",
    bairro: "Liberdade",
    label: "Liberdade Sul",
    coverage: 78,
    map: { x: 48, y: 48, width: 22, height: 24 },
    assignment: {
      owner: "Joao Pereira",
      shift: "Night" as const,
      channel: "meponto Liberdade Noite",
      status: "Watch" as const,
    },
  },
  {
    id: "tz-tatuape",
    bairro: "Tatuape",
    label: "Tatuape Norte",
    coverage: 64,
    map: { x: 67, y: 25, width: 23, height: 30 },
    assignment: {
      owner: "Marcos Lima",
      shift: "Night" as const,
      channel: "meponto Tatuape Risk",
      status: "Rebalance" as const,
    },
  },
  {
    id: "tz-pinheiros",
    bairro: "Pinheiros",
    label: "Pinheiros Base",
    coverage: 86,
    map: { x: 10, y: 51, width: 24, height: 27 },
    assignment: {
      owner: "Diego Alves",
      shift: "Day" as const,
      channel: "meponto Pinheiros 01",
      status: "Covered" as const,
    },
  },
];

function riskFromScore(score: number): TerritoryRisk {
  if (score >= 80) return "Critical";
  if (score >= 62) return "High";
  if (score >= 42) return "Medium";
  return "Low";
}

export function getTerritoryZones(): TerritoryZone[] {
  return zoneBlueprints.map((zone) => {
    const zonePontos = pontos.filter((ponto) => ponto.bairro === zone.bairro);
    const zoneRiders = riders.filter((rider) => rider.bairro === zone.bairro);
    const openIncidents = incidents.filter(
      (incident) => incident.status !== "Closed" && zonePontos.some((ponto) => ponto.name === incident.ponto),
    );
    const nightRiders = zoneRiders.filter((rider) => rider.status === "Night Shift").length;
    const avgSafety =
      zonePontos.reduce((sum, ponto) => sum + ponto.safetyScore, 0) / Math.max(zonePontos.length, 1);
    const density = zonePontos.reduce((sum, ponto) => sum + ponto.ridersCount, 0);
    const riskScore = Math.min(
      100,
      Math.round((100 - avgSafety) * 0.55 + openIncidents.length * 18 + nightRiders * 7 + Math.max(0, density - 55) * 0.18),
    );

    return {
      ...zone,
      density,
      nightRisk: riskFromScore(riskScore),
      nightRiskScore: riskScore,
      pontoIds: zonePontos.map((ponto) => ponto.id),
    };
  });
}

export function getTerritoryMetrics(zones = getTerritoryZones()): TerritoryMetrics {
  const totalCoverage = zones.reduce((sum, zone) => sum + zone.coverage, 0);
  const totalDensity = zones.reduce((sum, zone) => sum + zone.density, 0);
  const openIncidents = incidents.filter((incident) => incident.status !== "Closed").length;

  return {
    pontos: pontos.length,
    bairros: zones.length,
    coveredBairros: zones.filter((zone) => zone.coverage >= 75).length,
    riders: riders.length,
    nightRiders: riders.filter((rider) => rider.status === "Night Shift").length,
    avgCoverage: Math.round(totalCoverage / Math.max(zones.length, 1)),
    avgDensity: Math.round(totalDensity / Math.max(zones.length, 1)),
    criticalZones: zones.filter((zone) => zone.nightRisk === "Critical" || zone.nightRisk === "High").length,
    openIncidents,
  };
}

export function getTerritoryPayload() {
  const zones = getTerritoryZones();
  return {
    metrics: getTerritoryMetrics(zones),
    zones,
    pontos: pontos.map((ponto) => ({
      id: ponto.id,
      name: ponto.name,
      bairro: ponto.bairro,
      ridersCount: ponto.ridersCount,
      nightShiftLevel: ponto.nightShiftLevel,
      leader: ponto.leader,
      safetyScore: ponto.safetyScore,
      lat: ponto.lat,
      lng: ponto.lng,
    })),
  };
}
