import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, Badge, DataTable, Field, MiniMap, PageTitle } from "../../components/ui";
import { leaders, pontos, riders } from "../../lib/data";

export default async function PontoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ponto = pontos.find((item) => item.id === id);
  if (!ponto) notFound();

  const pontoRiders = riders.filter((rider) => rider.ponto === ponto.name);
  const pontoLeaders = leaders.filter((leader) => leader.ponto === ponto.name);

  return (
    <AppShell>
      <PageTitle title={ponto.name} eyebrow={ponto.bairro} action={<Link className="tag" href="/pontos">Back to Pontos</Link>} />
      <MiniMap />
      <section className="mt-4 grid gap-3 md:grid-cols-4">
        <Field label="Total Riders" value={ponto.ridersCount} />
        <Field label="Night Shift Riders" value={pontoRiders.filter((rider) => rider.status === "Night Shift").length} />
        <Field label="Leaders" value={pontoLeaders.length || 1} />
        <Field label="Active Rate" value="86%" />
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
          className="rounded-lg border border-[var(--line)] bg-white p-2"
        />
        <div className="min-w-[220px]">
          <div className="text-sm font-semibold">签到二维码 · QR de check-in</div>
          <p className="mt-1 max-w-sm text-xs opacity-70">
            打印并张贴在站点。骑手在 APP 扫码后按商城配置获得签到积分,每人每站每天一次。
            Imprima e fixe no ponto; cada entregador faz 1 check-in por dia.
          </p>
          <div className="mt-2 inline-block rounded bg-[var(--surface-raised,rgba(127,127,127,.12))] px-2 py-1 font-mono text-xs">{ponto.id}</div>
        </div>
      </section>
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <DataTable
          headers={["Leader Name", "Riders Count", "Status", "Action"]}
          rows={(pontoLeaders.length ? pontoLeaders : leaders.slice(0, 1)).map((leader) => [
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
