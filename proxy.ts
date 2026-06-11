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
      url.pathname = "/rider-app/mall";
      return NextResponse.rewrite(url);
    }
    if (pathname === "/rider-app/mall") {
      return NextResponse.redirect(new URL("https://mall.meponto.com/"));
    }
    if (pathname.startsWith("/rider-app")) {
      return NextResponse.redirect(new URL(`https://app.meponto.com${pathname}`));
    }
  }
  if (host === "app.meponto.com" && pathname === "/" && !session) {
    return NextResponse.redirect(new URL("/rider-login", request.url));
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

  if (pathname.startsWith("/login") || pathname === "/reset-password") {
    return NextResponse.next();
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
