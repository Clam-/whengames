import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import { getConvexHttp } from "@/lib/convex";
import { inferTimezoneHint, readViewerSession, writeViewerSession } from "@/lib/session";
import { env } from "@/lib/env";
import { getWorkos } from "@/lib/workos";

const fallbackRedirect = "/";

const decodeState = (value: string | null) => {
  if (!value) {
    return fallbackRedirect;
  }
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      returnTo?: string;
    };
    return decoded.returnTo || fallbackRedirect;
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

  const { profile } = await getWorkos().sso.getProfileAndToken({
    code,
    clientId: env.workosClientId()
  });
  const existingSession = await readViewerSession();
  const timezoneHint = await inferTimezoneHint();
  const displayName =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || profile.email;
  const avatarUrl =
    typeof profile.rawAttributes?.picture === "string"
      ? profile.rawAttributes.picture
      : undefined;

  const user = await getConvexHttp().mutation(api.users.upsertWorkosViewer, {
    anonymousUserId: existingSession?.userId as never,
    anonymousToken: existingSession?.anonymousToken,
    timezoneHint,
    workosUserId: profile.id,
    email: profile.email,
    displayName,
    avatarUrl
  });

  await writeViewerSession({
    anonymousToken: existingSession?.anonymousToken ?? crypto.randomUUID(),
    userId: user._id,
    timezoneHint
  });

  return NextResponse.redirect(new URL(returnTo, env.appUrl()));
}
