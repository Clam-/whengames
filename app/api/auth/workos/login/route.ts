import { NextResponse } from "next/server";

import { buildWorkosAuthorizeUrl } from "@/lib/workos";

type LoginState = {
  returnTo: string;
};

const sanitizeReturnTo = (value: string | null) => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));
  const state = Buffer.from(JSON.stringify({ returnTo } satisfies LoginState)).toString("base64url");
  return NextResponse.redirect(buildWorkosAuthorizeUrl(state));
}
