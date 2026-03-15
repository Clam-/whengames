import { NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import { getConvexHttp } from "@/lib/convex";
import { inferTimezoneHint, newAnonymousToken, readViewerSession, writeViewerSession } from "@/lib/session";

const ensureViewer = async () => {
  const existingSession = await readViewerSession();
  const timezoneHint = await inferTimezoneHint();

  if (!existingSession?.anonymousToken) {
    const anonymousToken = newAnonymousToken();
    const user = await getConvexHttp().mutation(api.users.ensureAnonymousViewer, {
      anonymousToken,
      timezoneHint
    });
    const nextSession = {
      anonymousToken,
      userId: user._id,
      timezoneHint
    };
    await writeViewerSession(nextSession);
    return { session: nextSession, user };
  }

  const user =
    existingSession.userId
      ? await getConvexHttp().query(api.users.getViewer, { userId: existingSession.userId })
      : null;

  if (user) {
    const nextSession = {
      ...existingSession,
      timezoneHint
    };
    await writeViewerSession(nextSession);
    return { session: nextSession, user };
  }

  const anonymousUser = await getConvexHttp().mutation(api.users.ensureAnonymousViewer, {
    anonymousToken: existingSession.anonymousToken,
    timezoneHint
  });
  const nextSession = {
    anonymousToken: existingSession.anonymousToken,
    userId: anonymousUser._id,
    timezoneHint,
    workosSession: existingSession.workosSession
  };
  await writeViewerSession(nextSession);
  return { session: nextSession, user: anonymousUser };
};

export async function GET() {
  const payload = await ensureViewer();
  return NextResponse.json(payload);
}
