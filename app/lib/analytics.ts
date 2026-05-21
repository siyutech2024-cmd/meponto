import { pontos, type Incident, type Rider } from "./data";

const severityWeight = {
  Low: 8,
  Medium: 18,
  High: 30,
  Critical: 45,
};

export function getRiderRiskScore(rider: Rider, incidents: Incident[]) {
  const riderIncidents = incidents.filter((incident) => incident.rider === rider.name && incident.status !== "Closed");
  const incidentScore = riderIncidents.reduce((sum, incident) => sum + severityWeight[incident.severity], 0);
  const arPenalty = Math.max(0, 90 - rider.ar) * 1.2;
  const nightPenalty = rider.nightShiftCount > 15 ? 8 : rider.nightShiftCount > 8 ? 4 : 0;
  const statusPenalty = rider.status === "Risk" ? 20 : rider.status === "Inactive" ? 10 : 0;

  return Math.min(100, Math.round(incidentScore + arPenalty + nightPenalty + statusPenalty + rider.incidentCount * 6));
}

export function getRiskLevel(score: number) {
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Medium";
  return "Low";
}

export function getRiderRiskRows(riders: Rider[], incidents: Incident[]) {
  return riders
    .map((rider) => {
      const score = getRiderRiskScore(rider, incidents);
      return {
        rider,
        score,
        level: getRiskLevel(score),
        openIncidents: incidents.filter((incident) => incident.rider === rider.name && incident.status !== "Closed").length,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function getPontoRiskRows(riders: Rider[], incidents: Incident[]) {
  return pontos
    .map((ponto) => {
      const pontoRiders = riders.filter((rider) => rider.ponto === ponto.name);
      const activeRiders = pontoRiders.filter((rider) => rider.status === "Active" || rider.status === "Night Shift").length;
      const nightShiftRiders = pontoRiders.filter((rider) => rider.status === "Night Shift").length;
      const openIncidents = incidents.filter((incident) => incident.ponto === ponto.name && incident.status !== "Closed").length;
      const avgRiderRisk = pontoRiders.length
        ? Math.round(pontoRiders.reduce((sum, rider) => sum + getRiderRiskScore(rider, incidents), 0) / pontoRiders.length)
        : 0;
      const score = Math.min(100, Math.round(avgRiderRisk + openIncidents * 12 + Math.max(0, 80 - ponto.safetyScore) * 0.8));

      return {
        ponto,
        activeRiders,
        nightShiftRiders,
        openIncidents,
        score,
        level: getRiskLevel(score),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function getNetworkMetrics(riders: Rider[], incidents: Incident[]) {
  const activeRiders = riders.filter((rider) => rider.status === "Active" || rider.status === "Night Shift").length;
  const nightShiftRiders = riders.filter((rider) => rider.status === "Night Shift").length;
  const openIncidents = incidents.filter((incident) => incident.status !== "Closed").length;
  const criticalIncidents = incidents.filter((incident) => incident.status !== "Closed" && incident.severity === "Critical").length;
  const avgAr = riders.length ? Math.round(riders.reduce((sum, rider) => sum + rider.ar, 0) / riders.length) : 0;
  const riskRows = getRiderRiskRows(riders, incidents);
  const highRiskRiders = riskRows.filter((row) => row.score >= 50).length;

  return {
    activeRiders,
    nightShiftRiders,
    openIncidents,
    criticalIncidents,
    avgAr,
    highRiskRiders,
    networkRiskScore: Math.min(100, Math.round(highRiskRiders * 12 + openIncidents * 9 + criticalIncidents * 18 + Math.max(0, 88 - avgAr))),
  };
}
