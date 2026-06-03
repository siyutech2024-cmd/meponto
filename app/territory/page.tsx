import { AppShell, Badge, DataTable, Field, PageTitle } from "../components/ui";
import { getTerritoryPayload, type TerritoryRisk, type TerritoryZone } from "../lib/territory";

function riskColor(risk: TerritoryRisk) {
  if (risk === "Critical") return "#f43f5e";
  if (risk === "High") return "#fb923c";
  if (risk === "Medium") return "#fdba74";
  return "#06d6a0";
}

function CoverageBar({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="flex min-w-40 items-center gap-2">
      <div className="h-2 w-28 overflow-hidden rounded border border-[var(--line)] bg-[var(--surface)]">
        <div className="h-full" style={{ width: `${value}%`, background: tone }} />
      </div>
      <span className="text-xs font-black">{value}%</span>
    </div>
  );
}

function TerritoryMap({ zones }: { zones: TerritoryZone[] }) {
  return (
    <div className="panel relative min-h-[520px] overflow-hidden p-4">
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(139,92,246,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.15)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="absolute left-[6%] right-[6%] top-[19%] h-px bg-[var(--line)]/40" />
      <div className="absolute bottom-[18%] left-[12%] right-[10%] h-px bg-[var(--line)]/40" />
      <div className="absolute bottom-[10%] left-[38%] top-[12%] w-px bg-[var(--line)]/40" />
      <div className="absolute bottom-[12%] right-[25%] top-[17%] w-px bg-[var(--line)]/40" />

      <div className="relative z-10 flex min-h-[488px] flex-col justify-between">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase text-[var(--accent)]">Territory command</div>
            <h2 className="mt-1 text-2xl font-black">Sao Paulo bairro coverage grid</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black uppercase text-[var(--muted)]">
            <span className="tag">Coverage</span>
            <span className="tag">Density</span>
            <span className="tag">Night risk</span>
            <span className="tag">Assignments</span>
          </div>
        </div>

        <div className="absolute inset-x-4 bottom-8 top-20">
          {zones.map((zone) => {
            const tone = riskColor(zone.nightRisk);
            return (
              <div
                key={zone.id}
                className="absolute overflow-hidden rounded border bg-[var(--surface)]/92 p-3 shadow-2xl"
                style={{
                  left: `${zone.map.x}%`,
                  top: `${zone.map.y}%`,
                  width: `${zone.map.width}%`,
                  minHeight: `${zone.map.height}%`,
                  borderColor: tone,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-black">{zone.label}</div>
                    <div className="text-xs uppercase text-[var(--muted)]">{zone.bairro}</div>
                  </div>
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: tone }} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-[var(--line)] bg-[var(--surface-raised)] p-2">
                    <div className="uppercase text-[var(--muted)]">Coverage</div>
                    <div className="mt-1 font-black">{zone.coverage}%</div>
                  </div>
                  <div className="rounded border border-[var(--line)] bg-[var(--surface-raised)] p-2">
                    <div className="uppercase text-[var(--muted)]">Riders</div>
                    <div className="mt-1 font-black">{zone.density}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--line)] pt-2 text-xs">
                  <span className="font-black" style={{ color: tone }}>
                    {zone.nightRisk} {zone.nightRiskScore}
                  </span>
                  <span className="text-[var(--muted)]">{zone.assignment.owner}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function TerritoryPage() {
  const { metrics, zones, pontos } = getTerritoryPayload();

  return (
    <AppShell>
      <PageTitle title="Territory Operations" eyebrow="Map and bairro control" />

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Field label="Pontos" value={metrics.pontos} />
        <Field label="Bairros" value={`${metrics.coveredBairros}/${metrics.bairros}`} />
        <Field label="Avg Coverage" value={`${metrics.avgCoverage}%`} />
        <Field label="Avg Density" value={metrics.avgDensity} />
        <Field label="Night Riders" value={metrics.nightRiders} />
        <Field label="Risk Zones" value={metrics.criticalZones} />
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_380px]">
        <TerritoryMap zones={zones} />
        <div className="space-y-4">
          <div className="panel p-4">
            <h2 className="mb-3 text-lg font-black">Night Risk Stack</h2>
            <div className="space-y-3">
              {zones
                .slice()
                .sort((a, b) => b.nightRiskScore - a.nightRiskScore)
                .map((zone) => (
                  <div key={zone.id} className="rounded border border-[var(--line)] bg-[var(--surface)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-black">{zone.bairro}</div>
                        <div className="text-xs text-[var(--muted)]">{zone.assignment.channel}</div>
                      </div>
                      <Badge value={zone.nightRisk} />
                    </div>
                    <div className="mt-3">
                      <CoverageBar value={zone.nightRiskScore} tone={riskColor(zone.nightRisk)} />
                    </div>
                  </div>
                ))}
            </div>
          </div>
          <div className="panel p-4">
            <h2 className="mb-3 text-lg font-black">Ponto Locations</h2>
            <div className="space-y-2">
              {pontos.map((ponto) => (
                <div key={ponto.id} className="grid grid-cols-[1fr_auto] gap-3 rounded border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
                  <div>
                    <div className="font-black">{ponto.name}</div>
                    <div className="text-xs text-[var(--muted)]">{ponto.bairro} / {ponto.leader}</div>
                  </div>
                  <div className="text-right text-xs text-[var(--muted)]">
                    <div>{ponto.lat.toFixed(4)}</div>
                    <div>{ponto.lng.toFixed(4)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-3 text-lg font-black">Territory Assignments</h2>
        <DataTable
          headers={["Zone", "Bairro", "Pontos", "Coverage", "Rider Density", "Night Risk", "Owner", "Shift", "Channel", "Status"]}
          rows={zones.map((zone) => [
            zone.label,
            zone.bairro,
            zone.pontoIds.length,
            <CoverageBar key="coverage" value={zone.coverage} tone="#06d6a0" />,
            zone.density,
            <div key="risk" className="flex items-center gap-2">
              <Badge value={zone.nightRisk} />
              <span className="text-xs text-[var(--muted)]">{zone.nightRiskScore}/100</span>
            </div>,
            zone.assignment.owner,
            zone.assignment.shift,
            zone.assignment.channel,
            <Badge key="status" value={zone.assignment.status} />,
          ])}
        />
      </section>
    </AppShell>
  );
}
