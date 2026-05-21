"use client";

import { CheckCircle2, Phone, ShieldAlert, Truck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AppShell, Badge, Field, PageTitle } from "../../components/ui";
import type { IncidentStatus } from "../../lib/data";
import { can } from "../../lib/rbac";
import { useVentoStore } from "../../lib/store";

function dialable(phone?: string) {
  return phone?.replace(/[^\d+]/g, "");
}

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const incidentId = params.id;
  const incidents = useVentoStore((state) => state.incidents);
  const riders = useVentoStore((state) => state.riders);
  const leaders = useVentoStore((state) => state.leaders);
  const auditLog = useVentoStore((state) => state.auditLog);
  const currentRole = useVentoStore((state) => state.currentRole);
  const recordIncidentResponse = useVentoStore((state) => state.recordIncidentResponse);
  const [feedback, setFeedback] = useState<string | null>(null);

  const incident = incidents.find((item) => item.id === incidentId);
  const rider = incident ? riders.find((item) => item.name === incident.rider) : undefined;
  const leader = incident ? leaders.find((item) => item.name === rider?.leader || item.ponto === incident.ponto) : undefined;
  const responseLog = useMemo(
    () => auditLog.filter((entry) => entry.entity === "Incident" && entry.entityId === incidentId),
    [auditLog, incidentId],
  );
  const canRespond = can(currentRole, "close_incidents");

  if (!incident) {
    return (
      <AppShell>
        <PageTitle title="Incident not found" eyebrow="Incident detail" action={<Link className="tag" href="/incidents">Back to Incidents</Link>} />
        <div className="panel p-4 text-sm text-[#8b8ba3]">No incident record exists for {incidentId}.</div>
      </AppShell>
    );
  }

  const riderPhone = dialable(rider?.phone);
  const emergencyPhone = dialable(leader?.phone ?? rider?.phone);
  const closed = incident.status === "Closed";

  function runResponse(action: string, detail: string, status: IncidentStatus, phone?: string) {
    recordIncidentResponse(incidentId, action, detail, status);
    setFeedback(detail);
    if (phone) {
      window.location.href = `tel:${phone}`;
    }
  }

  const actions = [
    {
      label: "Call Rider",
      icon: Phone,
      disabled: !riderPhone,
      onClick: () =>
        runResponse(
          "CALL_RIDER",
          `${incident.rider} contacted at ${rider?.phone ?? "phone on file"} for ${incident.id}.`,
          "Processing",
          riderPhone,
        ),
    },
    {
      label: "Call Emergency Contact",
      icon: ShieldAlert,
      disabled: !emergencyPhone,
      onClick: () =>
        runResponse(
          "CALL_EMERGENCY_CONTACT",
          `${leader?.name ?? "Emergency contact"} contacted at ${leader?.phone ?? rider?.phone ?? "phone on file"} for ${incident.rider}.`,
          "Processing",
          emergencyPhone,
        ),
    },
    {
      label: "Request Tow Truck",
      icon: Truck,
      disabled: false,
      onClick: () =>
        runResponse("REQUEST_TOW_TRUCK", `Tow truck requested for ${incident.location}; responder assigned to ${incident.responder}.`, "Processing"),
    },
    {
      label: "Close Incident",
      icon: CheckCircle2,
      disabled: closed,
      onClick: () => runResponse("CLOSE_INCIDENT", `${incident.id} closed after response actions were completed.`, "Closed"),
    },
  ];

  return (
    <AppShell>
      <PageTitle title={incident.id} eyebrow="Incident detail" action={<Link className="tag" href="/incidents">Back to Incidents</Link>} />
      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="panel p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black">Basic Info</h2>
            <Badge value={incident.status} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Rider" value={incident.rider} />
            <Field label="Location" value={incident.location} />
            <Field label="Time" value={incident.createdAt} />
            <Field label="Severity" value={<Badge value={incident.severity} />} />
          </div>
          <div className="mt-3 rounded border border-[#2a2a4a] bg-[#0d0d1a] p-3 text-sm text-[#c4c4d4]">{incident.description}</div>
        </div>
        <div className="panel p-4">
          <h2 className="mb-3 text-lg font-black">Image Upload</h2>
          <button className="h-32 w-full rounded border border-dashed border-[#2a2a4a] bg-[#0d0d1a] font-black text-[#8b8ba3]">
            Upload Image
          </button>
        </div>
      </section>
      <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="panel p-4">
          <h2 className="mb-3 text-lg font-black">Response Log</h2>
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <Field label="Responder" value={incident.responder} />
            <Field label="Current Status" value={<Badge value={incident.status} />} />
          </div>
          {feedback ? (
            <div aria-live="polite" className="mb-3 rounded border border-[#8b5cf6] bg-[#8b5cf6]/15 p-3 text-sm font-black text-[#8b5cf6]">
              {feedback}
            </div>
          ) : null}
          <div className="space-y-3">
            {responseLog.length ? (
              responseLog.map((entry) => (
                <div key={entry.id} className="rounded border border-[#2a2a4a] bg-[#0d0d1a] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-black">{entry.action}</span>
                    <span className="text-xs font-bold text-[#8b8ba3]">{entry.createdAt}</span>
                  </div>
                  <div className="mt-1 text-sm text-[#c4c4d4]">{entry.detail}</div>
                </div>
              ))
            ) : (
              <div className="rounded border border-[#2a2a4a] bg-[#0d0d1a] p-3 text-sm text-[#c4c4d4]">
                Leader notified, rider contacted, support route created.
              </div>
            )}
          </div>
        </div>
        <div className="panel grid content-start gap-2 p-4">
          {actions.map((action) => {
            const Icon = action.icon;
            const disabled = !canRespond || action.disabled;
            return (
              <button
                key={action.label}
                type="button"
                disabled={disabled}
                title={!canRespond ? `${currentRole} cannot perform this action` : undefined}
                onClick={disabled ? undefined : action.onClick}
                className="inline-flex h-11 items-center justify-center gap-2 rounded border border-[#8b5cf6] bg-[#8b5cf6] px-3 font-black text-white hover:brightness-110 disabled:cursor-not-allowed disabled:border-[#2a2a4a] disabled:bg-[#1a1a2e] disabled:text-[#4a4a60]"
              >
                <Icon size={18} />
                {action.label}
              </button>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
