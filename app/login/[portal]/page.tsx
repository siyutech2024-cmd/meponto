import { notFound } from "next/navigation";
import { PortalLogin } from "../../components/portal-login";
import { portalConfigs, type PortalId } from "../../lib/portals";

export default async function PortalLoginPage({ params }: { params: Promise<{ portal: string }> }) {
  const { portal } = await params;
  if (!(portal in portalConfigs)) notFound();
  return <PortalLogin portalId={portal as PortalId} />;
}

