import {
  AlertTriangle,
  Battery,
  CheckCircle2,
  Clock,
  MessageCircle,
  Moon,
  Radio,
  Send,
  ShieldAlert,
  Smartphone,
  Users,
} from "lucide-react";
import { AppShell, Badge, PageTitle } from "../components/ui";
import { getMobilePayload, type MobileWorkflowStatus } from "../lib/mobile";

export default function MobilePage() {
  const payload = getMobilePayload();
  const leaderWorkflows = payload.workflows.filter((workflow) => workflow.role === "Leader");
  const riderWorkflows = payload.workflows.filter((workflow) => workflow.role === "Rider");
  const supportIncident = payload.incidentDrafts[0];

  return (
    <AppShell>
      <PageTitle title="Mobile Operations" eyebrow="Android / In-App Chat first" />

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Android Flows" value={String(payload.summary.androidSessions)} />
        <Metric label="In-App Chat Flows" value={String(payload.summary.chatSessions)} />
        <Metric label="Check-ins Today" value={String(payload.summary.checkInsToday)} />
        <Metric label="Open Incidents" value={String(payload.summary.openMobileIncidents)} tone="warning" />
        <Metric label="SOS Target" value={payload.summary.emergencyResponseTarget} />
        <Metric label="Night Online" value={String(payload.summary.nightShiftOnline)} />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr_360px]">
        <PhonePanel title="Rider Android" subtitle="Check-in and incident submit">
          <div className="space-y-3">
            <StatusStrip icon={<CheckCircle2 size={17} />} label="Ready to ride" value="GPS locked" tone="ok" />
            {riderWorkflows.map((workflow) => (
              <WorkflowRow key={workflow.id} title={workflow.title} detail={workflow.primaryAction} status={workflow.status} />
            ))}
            <div className="rounded border border-[#2a2a4a] bg-[#0d0d1a] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-black">
                  <ShieldAlert size={17} className="text-[#fb923c]" />
                  Incident draft
                </div>
                <Badge value={supportIncident.severity} />
              </div>
              <div className="mt-2 text-sm text-[#c4c4d4]">{supportIncident.category}</div>
              <div className="mt-1 text-xs text-[#8b8ba3]">{supportIncident.location}</div>
            </div>
            <button
              type="button"
              className="flex h-11 w-full items-center justify-center gap-2 rounded border border-[#8b5cf6] bg-[#8b5cf6] text-sm font-black text-white"
            >
              <Send size={16} />
              Submit via In-App Chat
            </button>
          </div>
        </PhonePanel>

        <div className="space-y-4">
          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-[#8b5cf6]">
              <Smartphone size={16} />
              Workflow Control
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {payload.workflows.map((workflow) => (
                <div key={workflow.id} className="border-b border-[#1e1e3a] pb-3 last:border-0 lg:last:border-b">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-black">{workflow.title}</div>
                      <div className="text-xs text-[#8b8ba3]">
                        {workflow.role} / {workflow.channel}
                      </div>
                    </div>
                    <Badge value={workflow.status} />
                  </div>
                  <div className="mt-2 text-sm text-[#c4c4d4]">{workflow.detail}</div>
                  <div className="mt-2 text-xs font-black uppercase text-[#8b8ba3]">Target {workflow.responseTarget}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-[#8b5cf6]">
                <Radio size={16} />
                Emergency Support
              </div>
              <div className="space-y-3">
                {payload.emergencyLanes.map((lane) => (
                  <div key={lane.id} className="flex gap-3 border-b border-[#1e1e3a] pb-3 last:border-0 last:pb-0">
                    <AlertTriangle size={18} className="mt-1 text-[#fb923c]" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black">{lane.label}</span>
                        <Badge value={lane.status} />
                      </div>
                      <div className="mt-1 text-sm text-[#8b8ba3]">{lane.target}</div>
                      <div className="mt-1 text-sm text-[#c4c4d4]">{lane.nextStep}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-[#8b5cf6]">
                <Users size={16} />
                Team Roster
              </div>
              <div className="space-y-3">
                {payload.roster.map((member) => (
                  <div key={member.id} className="flex items-center justify-between gap-3 border-b border-[#1e1e3a] pb-3 last:border-0 last:pb-0">
                    <div>
                      <div className="font-black">{member.name}</div>
                      <div className="text-xs text-[#8b8ba3]">{member.ponto}</div>
                    </div>
                    <div className="text-right">
                      <Badge value={member.nightStatus} />
                      <div className="mt-1 flex items-center justify-end gap-1 text-xs text-[#8b8ba3]">
                        <Battery size={13} />
                        {member.batteryPct}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <PhonePanel title="Leader Mobile" subtitle="Roster, SOS, night shift pulse">
          <div className="space-y-3">
            <StatusStrip icon={<Moon size={17} />} label="Night shift" value={`${payload.summary.nightShiftOnline} online`} tone="watch" />
            {leaderWorkflows.map((workflow) => (
              <WorkflowRow key={workflow.id} title={workflow.title} detail={workflow.primaryAction} status={workflow.status} />
            ))}
            <div className="rounded border border-[#fb923c] bg-[#fb923c]/15 p-3">
              <div className="flex items-center gap-2 text-sm font-black text-[#fdba74]">
                <MessageCircle size={17} />
                In-App Chat active
              </div>
              <div className="mt-2 text-xs text-[#c4c4d4]">Broadcast safety pulse to Liberdade and Tatuape leaders every 30 minutes.</div>
            </div>
          </div>
        </PhonePanel>
      </section>
    </AppShell>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <div className="panel p-3">
      <div className="text-xs font-black uppercase text-[#8b8ba3]">{label}</div>
      <div className={tone === "warning" ? "mt-2 text-2xl font-black text-[#fb923c]" : "mt-2 text-2xl font-black"}>{value}</div>
    </div>
  );
}

function PhonePanel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[360px] rounded-[28px] border border-[#2a2a4a] bg-[#090a08] p-3 shadow-2xl">
      <div className="mx-auto mb-3 h-1.5 w-20 rounded-full bg-[#3c3f2e]" />
      <div className="min-h-[620px] rounded-[20px] border border-[#1e1e3a] bg-[#0d0d1a] p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase text-[#8b5cf6]">{title}</div>
            <div className="mt-1 text-lg font-black leading-tight">{subtitle}</div>
          </div>
          <Smartphone size={20} className="text-[#8b8ba3]" />
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusStrip({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "ok" | "watch" }) {
  return (
    <div
      className={
        tone === "ok"
          ? "flex items-center justify-between gap-3 rounded border border-[#06d6a0] bg-[#06d6a0]/15 p-3"
          : "flex items-center justify-between gap-3 rounded border border-[#fb923c] bg-[#fb923c]/15 p-3"
      }
    >
      <div className="flex items-center gap-2 text-sm font-black">
        {icon}
        {label}
      </div>
      <span className="text-xs font-black uppercase text-[#c4c4d4]">{value}</span>
    </div>
  );
}

function WorkflowRow({ title, detail, status }: { title: string; detail: string; status: MobileWorkflowStatus }) {
  return (
    <div className="rounded border border-[#2a2a4a] bg-[#1a1a2e] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-black">{title}</div>
        <Badge value={status} />
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm text-[#8b8ba3]">
        <Clock size={14} />
        {detail}
      </div>
    </div>
  );
}
