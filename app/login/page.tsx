import Link from "next/link";
import { ArrowRight, Bike, Building2, MapPinned, Store, Warehouse, type LucideIcon } from "lucide-react";
import { BrandLockup } from "../components/brand";
import { portalConfigs, type PortalId } from "../lib/portals";

const primaryPortals: Array<{ id: PortalId; icon: LucideIcon }> = [
  { id: "pontosys", icon: Building2 },
  { id: "franchise", icon: Warehouse },
  { id: "ponto", icon: MapPinned },
  { id: "rider", icon: Bike },
  { id: "pontomall", icon: Store },
];

export default function LoginGatewayPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--text)] sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-6">
          <BrandLockup markSize="lg" heading />
          <div className="text-right">
            <div className="text-xs font-black uppercase text-[var(--accent)]">Secure system access</div>
            <div className="mt-1 text-sm font-bold text-[var(--muted)]">请选择需要登录的独立系统</div>
          </div>
        </div>

        <section className="py-10">
          <h1 className="max-w-3xl text-3xl font-black leading-tight md:text-5xl">MePonto 运营生态系统</h1>
          <p className="mt-4 max-w-3xl text-base font-bold leading-7 text-[var(--muted-strong)]">
            每个系统使用独立账号、固定角色和固定数据范围。登录后不能切换角色或进入其他系统。
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {primaryPortals.map(({ id, icon: Icon }) => {
              const portal = portalConfigs[id];
              return (
                <Link
                  key={id}
                  href={`/login/${id}`}
                  className="group flex min-h-52 flex-col justify-between rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]"
                >
                  <div>
                    <Icon size={24} className="text-[var(--accent)]" />
                    <h2 className="mt-5 text-xl font-black">{portal.title}</h2>
                    <p className="mt-3 text-sm font-bold leading-6 text-[var(--muted)]">{portal.description}</p>
                  </div>
                  <div className="mt-5 flex items-center justify-between text-sm font-black">
                    登录
                    <ArrowRight size={17} className="text-[var(--muted)] group-hover:text-[var(--accent)]" />
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/login/partner" className="tag">Partner 服务点登录</Link>
            <Link href="/login/supplier" className="tag">供应商登录</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
