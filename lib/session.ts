import "server-only";

import crypto from "node:crypto";

import { cookies, headers } from "next/headers";

import { SESSION_COOKIE } from "@/lib/constants";
import { env } from "@/lib/env";
import type { ViewerSession } from "@/lib/types";

const encode = (payload: ViewerSession) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", env.sessionSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
};

const decode = (value?: string | null): ViewerSession | null => {
  if (!value) {
    return null;
  }
  const [body, signature] = value.split(".");
  if (!body || !signature) {
    return null;
  }
  const expected = crypto
    .createHmac("sha256", env.sessionSecret())
    .update(body)
    .digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ViewerSession;
  } catch {
    return null;
  }
};

export const inferTimezoneHint = async () => {
  const headerStore = await headers();
  return (
    headerStore.get("sec-ch-timezone") ??
    headerStore.get("x-timezone") ??
    undefined
  );
};

export const readViewerSession = async () => {
  const cookieStore = await cookies();
  return decode(cookieStore.get(SESSION_COOKIE)?.value);
};

export const writeViewerSession = async (session: ViewerSession) => {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, encode(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });
};

export const clearViewerSession = async () => {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
};

export const newAnonymousToken = () => crypto.randomUUID();
