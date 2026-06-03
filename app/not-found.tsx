import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="panel max-w-md p-5 text-center">
        <h1 className="text-3xl font-black">Record not found</h1>
        <p className="mt-2 text-[var(--muted)]">This PontoSys record is not available in the MVP dataset.</p>
        <Link className="mt-5 inline-flex h-11 items-center rounded border border-[var(--accent)] bg-[var(--accent)] px-4 font-black text-[var(--accent-ink)]" href="/dashboard">
          Return Dashboard
        </Link>
      </div>
    </main>
  );
}
