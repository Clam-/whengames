import { NextResponse } from "next/server";

import { clearViewerSession, readViewerSession } from "@/lib/session";
import { env } from "@/lib/env";
import { getWorkos } from "@/lib/workos";

export async function GET() {
  const session = await readViewerSession();
  await clearViewerSession();
  if (session?.workosSession) {
    try {
      const logoutUrl = await getWorkos()
        .userManagement.loadSealedSession({
          sessionData: session.workosSession,
          cookiePassword: env.sessionSecret()
        })
        .getLogoutUrl({ returnTo: new URL("/", env.appUrl()).toString() });
      return NextResponse.redirect(logoutUrl);
    } catch {
      // Fall back to a local logout if the hosted session cannot be read.
    }
  }
  return NextResponse.redirect(new URL("/", env.appUrl()));
}
