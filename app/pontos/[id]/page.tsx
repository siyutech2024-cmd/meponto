"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { AppShell, Badge, DataTable, Field, PageTitle } from "../../components/ui";
import { readSession } from "../../lib/session";
import { mapsEmbedUrl } from "../../lib/network";
import type { Leader, Ponto, Rider } from "../../lib/data";

/**
 * Station detail + printable check-in QR. Reads LIVE stations from
 * /api/network (DB-refreshed, RBAC-scoped) — franchise-created stations
 * (ids like `pt-…`) only exist there, not in the static MVP dataset.
 */
export default function PontoDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ""));
  const session = useMemo(() => readSession(), []);
  const headers = useMemo(
    () => ({ "Content-Type": "application/json", "x-vento-role": session?.role ?? "Super Admin" }),
    [session],
  );

  const [loaded, setLoaded] = useState(false);
  const [ponto, setPonto] = useState<Ponto | null>(null);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [peopleLoaded, setPeopleLoaded] = useState(false);

  // Progressive load: paint the station (name/map/QR) as soon as the network
  // payload lands; the heavy riders/leaders lists fill in afterwards instead
  // of blocking the whole page ("QR opens slowly" was three big fetches
  // gating the first paint).
  const load = useCallback(async () => {
    const stationReady = fetch("/api/network", { headers, cache: "no-store" }).then(async (networkRes) => {
      if (networkRes.ok) {
        const payload = await networkRes.json();
        const stations: Ponto[] = payload.data?.stations ?? [];
        setPonto(stations.find((item) => item.id === id) ?? null);
      }
      setLoaded(true);
    });
    const peopleReady = Promise.all([
      fetch("/api/riders", { headers, cache: "no-store" }),
      fetch("/api/leaders", { headers, cache: "no-store" }),
    ]).then(async ([ridersRes, leadersRes]) => {
      if (ridersRes.ok) setRiders((await ridersRes.json()).data ?? []);
      if (leadersRes.ok) setLeaders((await leadersRes.json()).data ?? []);
      setPeopleLoaded(true);
    });
    await Promise.all([stationReady, peopleReady]);
  }, [headers, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) {
    return (
      <AppShell>
        <div className="panel p-6 text-sm font-bold">Loading...</div>
      </AppShell>
    );
  }

  if (!ponto) {
    return (
      <AppShell>
        <div className="panel mx-auto mt-16 max-w-md p-8 text-center">
          <div className="text-xl font-black">Record not found</div>
          <p className="mt-2 text-sm opacity-70">This station was not found — it may be pending approval or was removed.</p>
          <Link href="/pontos" className="mt-4 inline-flex h-11 items-center rounded-[8px] bg-[var(--accent)] px-5 text-sm font-black uppercase text-[var(--accent-ink)]">
            Back to Pontos
          </Link>
        </div>
      </AppShell>
    );
  }

  const pontoRiders = riders.filter((rider) => rider.ponto === ponto.name);
  const pontoLeaders = leaders.filter((leader) => leader.ponto === ponto.name);
  const embed = mapsEmbedUrl(ponto.address, ponto.mapUrl);

  return (
    <AppShell>
      <PageTitle title={ponto.name} eyebrow={ponto.franchise ? `${ponto.franchise} · ${ponto.bairro}` : ponto.bairro} action={<Link className="tag" href="/pontos">Back to Pontos</Link>} />
      {embed ? (
        <iframe src={embed} title={`Mapa ${ponto.name}`} loading="lazy" className="h-64 w-full rounded-[12px] border-0 grayscale-[0.25] contrast-[1.05]" referrerPolicy="no-referrer-when-downgrade" />
      ) : (
        <div className="grid h-40 w-full place-items-center rounded-[12px] bg-gradient-to-br from-[var(--accent-glow)] to-[var(--surface-raised)] text-[var(--accent)]">
          <MapPin size={36} />
        </div>
      )}
      {ponto.address && (
        <a
          href={ponto.mapUrl?.trim() || `https://maps.google.com/maps?q=${encodeURIComponent(ponto.address)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex items-start gap-1.5 text-[12px] font-bold text-[var(--muted-strong)] hover:text-[var(--accent)]"
        >
          <MapPin size={13} className="mt-0.5 shrink-0 text-[var(--accent)]" /> {ponto.address}
        </a>
      )}
      <section className="mt-4 grid gap-3 md:grid-cols-4">
        <Field label="Total Riders" value={peopleLoaded ? pontoRiders.length : "…"} />
        <Field label="Night Shift Riders" value={peopleLoaded ? pontoRiders.filter((rider) => rider.status === "Night Shift").length : "…"} />
        <Field label="Leaders" value={peopleLoaded ? pontoLeaders.length : "…"} />
        <Field label="Safety Score" value={ponto.safetyScore} />
      </section>
      {/* 站点签到码 / check-in QR — print it and post it at the station. The
          rider app scans this exact value; /api/checkin only accepts codes
          that resolve to a real Ponto (once per rider per day). */}
      <section className="card mt-4 flex flex-wrap items-center gap-5 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(ponto.id)}`}
          alt={`QR de check-in — ${ponto.name}`}
          width={180}
          height={180}
          loading="eager"
          fetchPriority="high"
          className="min-h-[180px] min-w-[180px] rounded-lg border border-[var(--line)] bg-white p-2"
        />
        <div className="min-w-[220px]">
          <div className="text-sm font-semibold">签到二维码 · QR de check-in</div>
          <p className="mt-1 max-w-sm text-xs opacity-70">
            打印并张贴在站点。骑手在 APP 扫码后按商城配置获得签到积分,每人每站每天一次。
            Imprima e fixe no ponto; cada entregador faz 1 check-in por dia.
          </p>
          <div className="mt-2 inline-block rounded bg-[var(--surface-raised,rgba(127,127,127,.12))] px-2 py-1 font-mono text-xs" data-i18n-skip>{ponto.id}</div>
        </div>
      </section>
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <DataTable
          headers={["Leader Name", "Riders Count", "Status", "Action"]}
          rows={pontoLeaders.map((leader) => [
            leader.name,
            leader.ridersCount,
            <Badge key="status" value={leader.level} />,
            <Link key="action" className="tag" href={`/leaders/${leader.id}`}>View Leader</Link>,
          ])}
        />
        <DataTable
          headers={["Name", "AR", "Online Hours", "Status", "Action"]}
          rows={pontoRiders.map((rider) => [
            rider.name,
            `${rider.ar}%`,
            rider.onlineHours,
            <Badge key="status" value={rider.status} />,
            <Link key="action" className="tag" href={`/riders/${rider.id}`}>View Rider</Link>,
          ])}
        />
      </section>
    </AppShell>
  );
}
