import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import { getConvexHttp } from "@/lib/convex";
import { inferTimezoneHint, readViewerSession, writeViewerSession } from "@/lib/session";
import { env } from "@/lib/env";
import { getWorkos } from "@/lib/workos";

const fallbackRedirect = "/";

const sanitizeReturnTo = (value: string | undefined) => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallbackRedirect;
  }
  return value;
};

const decodeState = (value: string | null) => {
  if (!value) {
    return fallbackRedirect;
  }
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      returnTo?: string;
    };
    return sanitizeReturnTo(decoded.returnTo);
  } catch {
    return fallbackRedirect;
  }
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const returnTo = decodeState(requestUrl.searchParams.get("state"));

  if (!code) {
    return NextResponse.redirect(new URL(returnTo, env.appUrl()));
  }

  const authResponse = await getWorkos().userManagement.authenticateWithCode({
    code,
    clientId: env.workosClientId(),
    session: {
      sealSession: true,
      cookiePassword: env.sessionSecret()
    }
  });
  const existingSession = await readViewerSession();
  const timezoneHint = await inferTimezoneHint();
  const displayName =
    [authResponse.user.firstName, authResponse.user.lastName].filter(Boolean).join(" ").trim() ||
    authResponse.user.email;
  const avatarUrl = authResponse.user.profilePictureUrl ?? undefined;

  const user = await getConvexHttp().mutation(api.users.upsertWorkosViewer, {
    anonymousUserId: existingSession?.userId,
    anonymousToken: existingSession?.anonymousToken,
    timezoneHint,
    workosUserId: authResponse.user.id,
    email: authResponse.user.email,
    displayName,
    avatarUrl
  });

  await writeViewerSession({
    anonymousToken: existingSession?.anonymousToken ?? crypto.randomUUID(),
    userId: user._id,
    timezoneHint,
    workosSession: authResponse.sealedSession
  });

  return NextResponse.redirect(new URL(returnTo, env.appUrl()));
}
