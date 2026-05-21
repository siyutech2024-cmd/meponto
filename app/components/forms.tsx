"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { type LedgerEntry, type RiderStatus, type Severity } from "../lib/data";
import { useVentoStore } from "../lib/store";
import { Button, IconButton } from "./ui";

function Drawer({
  title,
  children,
  open,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
      <aside className="h-full w-full max-w-xl flex flex-col border-l border-[#2a2a4a] bg-[#0d0d1a] shadow-2xl animate-slide-up">
        <div className="flex min-h-16 items-center justify-between border-b border-[#2a2a4a] px-4">
          <h2 className="text-xl font-bold font-[family-name:var(--font-outfit)]">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="overflow-y-auto p-5 flex-1">{children}</div>
      </aside>
    </div>
  );
}

function TextInput({ name, label, required = true }: { name: string; label: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">{label}</span>
      <input 
        name={name} 
        required={required} 
        className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]" 
      />
    </label>
  );
}

export function AddRiderDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pontos = useVentoStore((state) => state.pontos);
  const leaders = useVentoStore((state) => state.leaders);
  const addRider = useVentoStore((state) => state.addRider);

  return (
    <Drawer title="Add Rider" open={open} onClose={onClose}>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          addRider({
            name: String(form.get("name")),
            cpf: String(form.get("cpf")),
            phone: String(form.get("phone")),
            pix: String(form.get("pix")),
            bairro: String(form.get("bairro")),
            ponto: String(form.get("ponto")),
            leader: String(form.get("leader")),
            status: String(form.get("status")) as RiderStatus,
          });
          event.currentTarget.reset();
          onClose();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput name="name" label="Name" />
          <TextInput name="cpf" label="CPF" />
          <TextInput name="phone" label="Phone" />
          <TextInput name="pix" label="PIX" />
          <TextInput name="bairro" label="Bairro" />
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Status</span>
            <select name="status" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6]">
              <option>Active</option>
              <option>Night Shift</option>
              <option>Risk</option>
              <option>Inactive</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Ponto</span>
            <select name="ponto" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6]">
              {pontos.map((ponto) => (
                <option key={ponto.id}>{ponto.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Leader</span>
            <select name="leader" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6]">
              {leaders.map((leader) => (
                <option key={leader.id}>{leader.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-2 flex justify-end">
          <Button>Save Rider</Button>
        </div>
      </form>
    </Drawer>
  );
}

export function AddPontoDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const leaders = useVentoStore((state) => state.leaders);
  const addPonto = useVentoStore((state) => state.addPonto);

  return (
    <Drawer title="Add Ponto" open={open} onClose={onClose}>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          addPonto({
            name: String(form.get("name")),
            bairro: String(form.get("bairro")),
            ridersCount: Number(form.get("ridersCount")),
            nightShiftLevel: String(form.get("nightShiftLevel")),
            leader: String(form.get("leader")),
            safetyScore: Number(form.get("safetyScore")),
            lat: Number(form.get("lat")),
            lng: Number(form.get("lng")),
          });
          event.currentTarget.reset();
          onClose();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput name="name" label="Ponto Name" />
          <TextInput name="bairro" label="Bairro" />
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Leader</span>
            <select name="leader" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6]">
              <option>Unassigned</option>
              {leaders.map((leader) => (
                <option key={leader.id}>{leader.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Night Shift Level</span>
            <select name="nightShiftLevel" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6]">
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Riders Count</span>
            <input name="ridersCount" required min="0" type="number" defaultValue="0" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]" />
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Safety Score</span>
            <input name="safetyScore" required min="0" max="100" type="number" defaultValue="75" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]" />
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Latitude</span>
            <input name="lat" required step="0.0001" type="number" defaultValue="-23.5505" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]" />
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Longitude</span>
            <input name="lng" required step="0.0001" type="number" defaultValue="-46.6333" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]" />
          </label>
        </div>
        <div className="mt-2 flex justify-end">
          <Button>Save Ponto</Button>
        </div>
      </form>
    </Drawer>
  );
}

export function AddLeaderDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pontos = useVentoStore((state) => state.pontos);
  const addLeader = useVentoStore((state) => state.addLeader);

  return (
    <Drawer title="Add Leader" open={open} onClose={onClose}>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          addLeader({
            name: String(form.get("name")),
            phone: String(form.get("phone")),
            ponto: String(form.get("ponto")),
            ridersCount: Number(form.get("ridersCount")),
            nightShiftCoverage: Number(form.get("nightShiftCoverage")),
            rating: Number(form.get("rating")),
            level: String(form.get("level")),
          });
          event.currentTarget.reset();
          onClose();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput name="name" label="Leader Name" />
          <TextInput name="phone" label="Phone" />
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Ponto</span>
            <select name="ponto" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6]">
              {pontos.map((ponto) => (
                <option key={ponto.id}>{ponto.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Level</span>
            <select name="level" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6]">
              <option>New</option>
              <option>Senior</option>
              <option>Elite</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Riders Count</span>
            <input name="ridersCount" required min="0" type="number" defaultValue="0" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]" />
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Night Shift Coverage</span>
            <input name="nightShiftCoverage" required min="0" max="100" type="number" defaultValue="50" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]" />
          </label>
          <label className="block">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Rating</span>
            <input name="rating" required min="1" max="5" step="0.1" type="number" defaultValue="4.0" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]" />
          </label>
        </div>
        <div className="mt-2 flex justify-end">
          <Button>Save Leader</Button>
        </div>
      </form>
    </Drawer>
  );
}

export function IncidentDrawer({
  open,
  onClose,
  riderName,
  pontoName,
}: {
  open: boolean;
  onClose: () => void;
  riderName?: string;
  pontoName?: string;
}) {
  const riders = useVentoStore((state) => state.riders);
  const addIncident = useVentoStore((state) => state.addIncident);
  const [selectedRider, setSelectedRider] = useState(riderName ?? riders[0]?.name ?? "");
  const rider = riders.find((item) => item.name === selectedRider);

  useEffect(() => {
    if (open) {
      setSelectedRider(riderName ?? riders[0]?.name ?? "");
    }
  }, [open, riderName, riders]);

  return (
    <Drawer title="Create Incident" open={open} onClose={onClose}>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          addIncident({
            rider: String(form.get("rider")),
            ponto: String(form.get("ponto")),
            severity: String(form.get("severity")) as Severity,
            location: String(form.get("location")),
            description: String(form.get("description")),
          });
          event.currentTarget.reset();
          onClose();
        }}
      >
        <label className="block">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Rider</span>
          <select
            name="rider"
            value={selectedRider}
            onChange={(event) => setSelectedRider(event.target.value)}
            className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6]"
          >
            {riders.map((item) => (
              <option key={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <input type="hidden" name="ponto" value={pontoName ?? rider?.ponto ?? ""} />
        <label className="block">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Severity</span>
          <select name="severity" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6]">
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
            <option>Critical</option>
          </select>
        </label>
        <TextInput name="location" label="Location" />
        <label className="block">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Description</span>
          <textarea name="description" required className="min-h-32 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] p-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]" />
        </label>
        <div className="mt-2 flex justify-end">
          <Button>Create Incident</Button>
        </div>
      </form>
    </Drawer>
  );
}

export function RewardDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const riders = useVentoStore((state) => state.riders);
  const leaders = useVentoStore((state) => state.leaders);
  const addLedgerEntry = useVentoStore((state) => state.addLedgerEntry);
  const [recipientType, setRecipientType] = useState<LedgerEntry["recipientType"]>("Rider");
  const recipients = recipientType === "Rider" ? riders.map((rider) => rider.name) : leaders.map((leader) => leader.name);

  return (
    <Drawer title="Send Reward" open={open} onClose={onClose}>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          addLedgerEntry({
            recipient: String(form.get("recipient")),
            recipientType,
            ledgerType: String(form.get("ledgerType")) as LedgerEntry["ledgerType"],
            amount: Number(form.get("amount")),
            notes: String(form.get("notes")),
          });
          event.currentTarget.reset();
          onClose();
        }}
      >
        <label className="block">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Recipient Type</span>
          <select
            value={recipientType}
            onChange={(event) => setRecipientType(event.target.value as LedgerEntry["recipientType"])}
            className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6]"
          >
            <option>Rider</option>
            <option>Leader</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Recipient</span>
          <select name="recipient" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6]">
            {recipients.map((recipient) => (
              <option key={recipient}>{recipient}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Ledger Type</span>
          <select name="ledgerType" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6]">
            <option>Reward</option>
            <option>Leader Commission</option>
            <option>PIX</option>
            <option>Subsidy</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Amount</span>
          <input name="amount" required min="1" step="1" type="number" className="h-11 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] px-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]" />
        </label>
        <label className="block">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#8b8ba3]">Notes</span>
          <textarea name="notes" required className="min-h-28 w-full rounded-xl border border-[#2a2a4a] bg-[#1a1a2e] p-3.5 text-[#f0f0ff] outline-none transition-all duration-200 focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]" />
        </label>
        <div className="mt-2 flex justify-end">
          <Button>Queue Reward</Button>
        </div>
      </form>
    </Drawer>
  );
}
