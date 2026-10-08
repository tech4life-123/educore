import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { isKnownAppHost, resolveTenantHost } from "@/lib/tenant-host";
import { getPrimaryHosts } from "@/lib/env";

export async function proxy(request: NextRequest) {
  // Off by default: EDUCORE_PRIMARY_HOSTS unset means this block never runs,
  // so today's behaviour (every host serves the app normally) is unchanged
  // until that variable is deliberately configured. See ARCHITECTURE.md §21.2.
  if (getPrimaryHosts().length > 0) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const hostname = host?.split(":")[0]?.toLowerCase();

    if (hostname && !isKnownAppHost(hostname)) {
      const match = await resolveTenantHost(hostname);
      // A hostname that is neither this app's own host NOR a verified school
      // domain gets the generic fallback, so an unconfigured or not-yet-verified
      // domain never silently serves the full app under a stranger's name.
      if (!match) {
        return NextResponse.rewrite(new URL("/site-unavailable", request.url));
      }
      // A verified school domain shows that school's public page at its front
      // door only; every other path (sign-in, the app itself) is unchanged.
      // The page re-derives the school from the hostname (ARCHITECTURE.md §21.5).
      if (request.nextUrl.pathname === "/") {
        return NextResponse.rewrite(new URL("/school-site", request.url));
      }
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
