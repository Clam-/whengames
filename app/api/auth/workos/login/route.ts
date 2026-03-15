import { NextResponse } from "next/server";

import { buildWorkosAuthorizeUrl } from "@/lib/workos";

type LoginState = {
  returnTo: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/";
  const state = Buffer.from(JSON.stringify({ returnTo } satisfies LoginState)).toString("base64url");
  return NextResponse.redirect(buildWorkosAuthorizeUrl(state));
}
