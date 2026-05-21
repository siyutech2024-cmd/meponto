import type { Incident } from "./data";

export type NotificationStatus = "Unread" | "Read" | "Acknowledged";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  source: "Incident" | "System";
  sourceId: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  createdAt: string;
  readAt?: string;
  acknowledgedAt?: string;
};

export function getNotificationStatus(notification: NotificationItem): NotificationStatus {
  if (notification.acknowledgedAt) return "Acknowledged";
  if (notification.readAt) return "Read";
  return "Unread";
}

export function notificationFromIncident(incident: Incident): NotificationItem {
  return {
    id: `ntf-${incident.id}`,
    title: `${incident.severity} incident: ${incident.rider}`,
    body: `${incident.location} - ${incident.description}`,
    href: `/incidents/${incident.id}`,
    source: "Incident",
    sourceId: incident.id,
    severity: incident.severity,
    createdAt: incident.createdAt,
  };
}

export function seedNotificationsFromIncidents(incidents: Incident[]): NotificationItem[] {
  return incidents.filter((incident) => incident.status !== "Closed").map(notificationFromIncident);
}
