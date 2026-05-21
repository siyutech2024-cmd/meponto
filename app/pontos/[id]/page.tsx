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
