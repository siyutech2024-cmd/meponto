import { NextResponse, type NextRequest } from "next/server";
import { portalConfigs, portalHostMap } from "./app/lib/portals";
import { SESSION_COOKIE, verifySessionToken } from "./app/lib/auth-session";

// Brand site hosts: the root path serves the public marketing page.
const marketingHosts = new Set(["meponto.com", "www.meponto.com"]);

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  const hostPortalId = portalHostMap[host];
  const pathname = request.nextUrl.pathname;
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  // SEO endpoints answer on every host (host-aware content lives in /api/seo).
  if (pathname === "/robots.txt") return NextResponse.rewrite(new URL("/api/seo/robots", request.url));
  if (pathname === "/sitemap.xml") return NextResponse.rewrite(new URL("/api/seo/sitemap", request.url));

  if (marketingHosts.has(host) && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.rewrite(url);
  }

  // ---- Host isolation (launch) -------------------------------------------
  // mall.meponto.com  = PUBLIC storefront. Anyone can browse; login is only
  //                     required at redeem time. Any other rider-app path on
  //                     this host belongs to app.meponto.com.
  // app.meponto.com   = the rider APP. Root goes straight to /rider-app, and
  //                     unauthenticated users land on /rider-login (no portal picker).
  if (host === "mall.meponto.com") {
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/store";
      return NextResponse.rewrite(url);
    }
    // Mall back office entrance: mall.meponto.com/admin → workspace (login-gated).
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      return NextResponse.redirect(new URL("/mall", request.url));
    }
    if (pathname === "/rider-app/mall") {
      return NextResponse.redirect(new URL("https://mall.meponto.com/"));
    }
    if (pathname.startsWith("/rider-app/")) {
      return NextResponse.redirect(new URL(`https://app.meponto.com${pathname.slice("/rider-app".length)}`));
    }
    // Rider APP sections opened on the mall host belong to app.meponto.com.
    const mallFirstSegment = pathname.split("/")[1] ?? "";
    if (["wallet", "shifts", "agenda", "support", "scan"].includes(mallFirstSegment)) {
      return NextResponse.redirect(new URL(`https://app.meponto.com${pathname}`));
    }
  }
  if (host === "app.meponto.com") {
    // Clean URLs: app.meponto.com/shifts (not /rider-app/shifts).
    if (pathname === "/rider-app" || pathname === "/rider-app/") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (pathname.startsWith("/rider-app/")) {
      return NextResponse.redirect(new URL(pathname.slice("/rider-app".length), request.url));
    }
    if (pathname === "/" && !session) {
      return NextResponse.redirect(new URL("/rider-login", request.url));
    }
    const riderSections = new Set(["wallet", "shifts", "agenda", "mall", "support", "scan"]);
    const firstSegment = pathname.split("/")[1] ?? "";
    // /scan?partner=… and /scan?ref=… are the PUBLIC QR validation page; the
    // bare /scan is the in-app camera scanner.
    const isPublicScan = firstSegment === "scan" && (request.nextUrl.searchParams.has("partner") || request.nextUrl.searchParams.has("ref"));
    if (riderSections.has(firstSegment) && !isPublicScan) {
      const url = request.nextUrl.clone();
      url.pathname = `/rider-app${pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  if (pathname === "/") {
    if (hostPortalId) {
      if (!session) return NextResponse.redirect(new URL(`/login/${hostPortalId}`, request.url));
      if (session.portal !== hostPortalId) return NextResponse.redirect(new URL(portalConfigs[session.portal].homePath, request.url));
      const url = request.nextUrl.clone();
      url.pathname = portalConfigs[hostPortalId].homePath;
      return NextResponse.rewrite(url);
    }
    return NextResponse.redirect(new URL(session ? portalConfigs[session.portal].homePath : "/login", request.url));
  }

  // On a portal domain the login lives at the clean "/login" (no redundant
  // "/login/<portal>" suffix). The marketing host keeps the system picker.
  if (hostPortalId) {
    if (pathname === `/login/${hostPortalId}`) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = `/login/${hostPortalId}`;
      return NextResponse.rewrite(url);
    }
    // Another system's login on this domain → send to its own domain's clean login.
    if (pathname.startsWith("/login/")) {
      const target = Object.values(portalConfigs).find((p) => pathname === `/login/${p.id}`);
      if (target?.futureDomain) return NextResponse.redirect(new URL(`https://${target.futureDomain}/login`));
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  if (pathname.startsWith("/login") || pathname === "/reset-password") {
    return NextResponse.next();
  }

  // Legacy import URL → the real upload lives on the KPI board.
  if (pathname === "/ninety-nine-import" || pathname.startsWith("/ninety-nine-import/")) {
    return NextResponse.redirect(new URL("/performance", request.url));
  }

  // ---- Strict host ⇄ portal binding ---------------------------------------
  // Each portal domain only serves ITS OWN pages. Opening another system's
  // path (e.g. franchise.meponto.com/pontosys) bounces to the owning domain —
  // regardless of who is logged in.
  const publicPaths = ["/rider-login", "/scan", "/privacy", "/home", "/store", "/llms.txt", "/og.png", "/480d2d55480284b1ce870c54bf62e21a.txt"];
  if (hostPortalId && !publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const hostPortal = portalConfigs[hostPortalId];
    const belongsTo = (portal: (typeof portalConfigs)[keyof typeof portalConfigs]) =>
      pathname === portal.homePath ||
      pathname.startsWith(`${portal.homePath}/`) ||
      portal.modules.some((module) => pathname === module.href || pathname.startsWith(`${module.href}/`));
    if (!belongsTo(hostPortal)) {
      const owner = Object.values(portalConfigs).find((portal) => portal.id !== hostPortalId && belongsTo(portal));
      if (owner?.futureDomain) {
        return NextResponse.redirect(new URL(`https://${owner.futureDomain}${pathname}`));
      }
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  const allowedPortals = Object.values(portalConfigs)
    .filter((portal) =>
      pathname === portal.homePath ||
      pathname.startsWith(`${portal.homePath}/`) ||
      portal.modules.some((module) => pathname === module.href || pathname.startsWith(`${module.href}/`)),
    )
    .map((portal) => portal.id);

  if (!allowedPortals.length) return NextResponse.next();
  if (!session) {
    const loginPortal = hostPortalId && allowedPortals.includes(hostPortalId) ? hostPortalId : allowedPortals[0];
    return NextResponse.redirect(new URL(`/login/${loginPortal}`, request.url));
  }
  if (!allowedPortals.includes(session.portal)) {
    return NextResponse.redirect(new URL(portalConfigs[session.portal].homePath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|meponto-).*)"],
};
