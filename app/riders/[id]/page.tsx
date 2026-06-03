"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, Badge, Button, DataTable, Field, GuardedButton, PageTitle } from "../../components/ui";
import { type RiderStatus } from "../../lib/data";
import { maskCpf, maskPix } from "../../lib/masking";
import { can } from "../../lib/rbac";
import { useVentoStore, type RiderUpdate } from "../../lib/store";

type ActionKey = "profile" | "vehicle" | "leader" | "ponto";

const riderStatuses: RiderStatus[] = ["Active", "Night Shift", "Risk", "Inactive"];

function TextInput({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase text-[#8b8ba3]">{label}</span>
      <input name={name} required defaultValue={defaultValue} className="h-11 w-full rounded border border-[#2a2a4a] bg-[#1a1a2e] px-3 outline-none" />
    </label>
  );
}

function SelectInput({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: string; options: string[] }) {
  const values = options.includes(defaultValue) ? options : [defaultValue, ...options];

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase text-[#8b8ba3]">{label}</span>
      <select name={name} defaultValue={defaultValue} className="h-11 w-full rounded border border-[#2a2a4a] bg-[#1a1a2e] px-3 outline-none">
        {values.map((value) => (
          <option key={value} value={value}>{value}</option>
        ))}
      </select>
    </label>
  );
}

function SensitiveField({
  label,
  value,
  maskedValue,
  revealed,
}: {
  label: string;
  value: string;
  maskedValue: string;
  revealed: boolean;
}) {
  return (
    <Field
      label={label}
      value={
        <span className="font-mono tracking-normal">
          {revealed ? value : maskedValue}
        </span>
      }
    />
  );
}

export default function RiderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const riders = useVentoStore((state) => state.riders);
  const incidents = useVentoStore((state) => state.incidents);
  const pontos = useVentoStore((state) => state.pontos);
  const leaders = useVentoStore((state) => state.leaders);
  const updateRider = useVentoStore((state) => state.updateRider);
  const currentRole = useVentoStore((state) => state.currentRole);
  const rider = riders.find((item) => item.id === id);
  const [activeAction, setActiveAction] = useState<ActionKey | null>(null);
  const [sensitiveRevealed, setSensitiveRevealed] = useState(false);
  const actionFormRef = useRef<HTMLFormElement>(null);
  const canRevealSensitive = can(currentRole, "manage_riders") || can(currentRole, "view_finance");
  const showSensitive = canRevealSensitive && sensitiveRevealed;

  const history = useMemo(() => (rider ? incidents.filter((incident) => incident.rider === rider.name) : []), [incidents, rider]);
  const leaderNames = leaders.map((leader) => leader.name);
  const pontoNames = pontos.map((ponto) => ponto.name);

  useEffect(() => {
    setSensitiveRevealed(false);
  }, [canRevealSensitive, id]);

  function submitUpdate(patchFromForm: (form: FormData) => RiderUpdate, action: string) {
    if (!rider || !actionFormRef.current) return;

    updateRider(rider.id, patchFromForm(new FormData(actionFormRef.current)), action);
    setActiveAction(null);
  }

  if (!rider) {
    return (
      <AppShell>
        <PageTitle title="Rider not found" eyebrow="Rider detail" action={<Link className="tag" href="/riders">Back to Riders</Link>} />
        <div className="panel p-4 text-sm text-[#8b8ba3]">This rider is not available in the current workspace data.</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageTitle title={rider.name} eyebrow="Rider detail" action={<Link className="tag" href="/riders">Back to Riders</Link>} />
      <section className="mb-4 flex flex-wrap gap-2">
        <GuardedButton permission="manage_riders" onClick={() => setActiveAction(activeAction === "profile" ? null : "profile")}>Edit Profile</GuardedButton>
        <GuardedButton permission="manage_riders" onClick={() => setActiveAction(activeAction === "vehicle" ? null : "vehicle")}>Update Vehicle</GuardedButton>
        <GuardedButton permission="manage_riders" onClick={() => setActiveAction(activeAction === "leader" ? null : "leader")}>Change Leader</GuardedButton>
        <GuardedButton permission="manage_riders" onClick={() => setActiveAction(activeAction === "ponto" ? null : "ponto")}>Move Ponto</GuardedButton>
      </section>

      {activeAction ? (
        <section className="panel mb-4 p-4">
          <h2 className="mb-3 text-lg font-black">
            {activeAction === "profile" ? "Edit Profile" : activeAction === "vehicle" ? "Update Vehicle" : activeAction === "leader" ? "Change Leader" : "Move Ponto"}
          </h2>
          <form ref={actionFormRef} className="grid gap-4" onSubmit={(event) => event.preventDefault()}>
            {activeAction === "profile" ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <TextInput name="name" label="Name" defaultValue={rider.name} />
                <TextInput name="cpf" label="CPF" defaultValue={rider.cpf} />
                <TextInput name="phone" label="Phone" defaultValue={rider.phone} />
                <TextInput name="pix" label="PIX" defaultValue={rider.pix} />
                <TextInput name="bairro" label="Bairro" defaultValue={rider.bairro} />
                <SelectInput name="status" label="Status" defaultValue={rider.status} options={riderStatuses} />
              </div>
            ) : null}

            {activeAction === "vehicle" ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <TextInput name="vehicleType" label="Vehicle Type" defaultValue={rider.vehicleType} />
                <TextInput name="brand" label="Brand" defaultValue={rider.brand} />
                <TextInput name="model" label="Model" defaultValue={rider.model} />
                <SelectInput name="rentalStatus" label="Rental Status" defaultValue={rider.rentalStatus} options={["Owned", "Rental", "Unknown"]} />
                <label className="flex min-h-11 items-center gap-3 rounded border border-[#2a2a4a] bg-[#1a1a2e] px-3 sm:col-span-2 lg:col-span-4">
                  <input name="isMottu" type="checkbox" defaultChecked={rider.isMottu} className="h-4 w-4 accent-[#8b5cf6]" />
                  <span className="text-sm font-black">Mottu vehicle</span>
                </label>
              </div>
            ) : null}

            {activeAction === "leader" ? (
              <div className="max-w-md">
                <SelectInput name="leader" label="Leader" defaultValue={rider.leader} options={leaderNames} />
              </div>
            ) : null}

            {activeAction === "ponto" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectInput name="ponto" label="Ponto" defaultValue={rider.ponto} options={pontoNames} />
                <SelectInput name="leader" label="Leader" defaultValue={rider.leader} options={leaderNames} />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => {
                  if (activeAction === "profile") {
                    submitUpdate(
                      (form) => ({
                        name: String(form.get("name")),
                        cpf: String(form.get("cpf")),
                        phone: String(form.get("phone")),
                        pix: String(form.get("pix")),
                        bairro: String(form.get("bairro")),
                        status: String(form.get("status")) as RiderStatus,
                      }),
                      "UPDATE_RIDER_PROFILE",
                    );
                  } else if (activeAction === "vehicle") {
                    submitUpdate(
                      (form) => ({
                        vehicleType: String(form.get("vehicleType")),
                        brand: String(form.get("brand")),
                        model: String(form.get("model")),
                        rentalStatus: String(form.get("rentalStatus")),
                        isMottu: form.get("isMottu") === "on",
                      }),
                      "UPDATE_RIDER_VEHICLE",
                    );
                  } else if (activeAction === "leader") {
                    submitUpdate((form) => ({ leader: String(form.get("leader")) }), "CHANGE_RIDER_LEADER");
                  } else {
                    submitUpdate(
                      (form) => {
                        const pontoName = String(form.get("ponto"));
                        const ponto = pontos.find((item) => item.name === pontoName);
                        return {
                          ponto: pontoName,
                          bairro: ponto?.bairro ?? rider.bairro,
                          leader: String(form.get("leader")),
                          chatRoom: ponto ? `MePonto ${ponto.bairro}` : rider.chatRoom,
                        };
                      },
                      "MOVE_RIDER_PONTO",
                    );
                  }
                }}
              >
                {activeAction === "profile" ? "Save Profile" : activeAction === "vehicle" ? "Save Vehicle" : activeAction === "leader" ? "Save Leader" : "Save Move"}
              </Button>
              <Button type="button" onClick={() => setActiveAction(null)}>Cancel</Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-black">Basic Info</h2>
            <button
              type="button"
              className="tag inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canRevealSensitive}
              title={canRevealSensitive ? undefined : `${currentRole} cannot reveal CPF or PIX`}
              onClick={() => setSensitiveRevealed((revealed) => !revealed)}
            >
              {showSensitive ? <EyeOff size={15} /> : <Eye size={15} />}
              {showSensitive ? "Hide" : "Reveal"}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SensitiveField label="CPF" value={rider.cpf} maskedValue={maskCpf(rider.cpf)} revealed={showSensitive} />
            <SensitiveField label="PIX" value={rider.pix} maskedValue={maskPix(rider.pix)} revealed={showSensitive} />
            <Field label="Phone" value={rider.phone} />
            <Field label="Bairro" value={rider.bairro} />
          </div>
        </div>
        <div className="panel p-4">
          <h2 className="mb-3 text-lg font-black">Vehicle</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vehicle Type" value={rider.vehicleType} />
            <Field label="Brand / Model" value={`${rider.brand} ${rider.model}`} />
            <Field label="Rental Status" value={rider.rentalStatus} />
            <Field label="Is Mottu" value={rider.isMottu ? "Yes" : "No"} />
          </div>
        </div>
        <div className="panel p-4">
          <h2 className="mb-3 text-lg font-black">Performance</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="AR" value={`${rider.ar}%`} />
            <Field label="Online Hours" value={rider.onlineHours} />
            <Field label="Night Shift Count" value={rider.nightShiftCount} />
            <Field label="Incidents" value={rider.incidentCount} />
          </div>
        </div>
        <div className="panel p-4">
          <h2 className="mb-3 text-lg font-black">Social Network</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Current Ponto" value={rider.ponto} />
            <Field label="Current Leader" value={rider.leader} />
            <Field label="Invited By" value={rider.invitedBy} />
            <Field label="In-App Chat Room" value={rider.chatRoom} />
          </div>
        </div>
      </section>
      <section className="mt-4">
        <DataTable
          headers={["Date", "Type", "Severity", "Status", "Action"]}
          rows={history.map((incident) => [
            incident.createdAt,
            "Accident / Support",
            <Badge key="severity" value={incident.severity} />,
            <Badge key="status" value={incident.status} />,
            <Link key="action" className="tag" href={`/incidents/${incident.id}`}>View Incident</Link>,
          ])}
        />
      </section>
    </AppShell>
  );
}
