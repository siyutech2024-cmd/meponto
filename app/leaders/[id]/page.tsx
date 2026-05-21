import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, DataTable, Field, PageTitle } from "../../components/ui";
import { leaders, rewards } from "../../lib/data";

export default async function LeaderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leader = leaders.find((item) => item.id === id);
  if (!leader) notFound();

  return (
    <AppShell>
      <PageTitle title={leader.name} eyebrow="Leader detail" action={<Link className="tag" href="/leaders">Back to Leaders</Link>} />
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <h2 className="mb-3 text-lg font-black">Leader Info</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone" value={leader.phone} />
            <Field label="Ponto" value={leader.ponto} />
            <Field label="Level" value={leader.level} />
            <Field label="Join Date" value={leader.joinDate} />
          </div>
        </div>
        <div className="panel p-4">
          <h2 className="mb-3 text-lg font-black">Team Data</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Riders Count" value={leader.ridersCount} />
            <Field label="Active Riders" value={Math.round(leader.ridersCount * 0.86)} />
            <Field label="Night Shift Riders" value={Math.round((leader.ridersCount * leader.nightShiftCoverage) / 100)} />
            <Field label="Incidents" value={leader.incidents} />
          </div>
        </div>
      </section>
      <section className="mt-4">
        <DataTable
          headers={["Date", "Reward Type", "Amount"]}
          rows={rewards.map((reward, index) => [`2026-05-${10 + index}`, reward.ruleName, `R$ ${120 + index * 60}`])}
        />
      </section>
    </AppShell>
  );
}
