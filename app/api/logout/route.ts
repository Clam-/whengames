import { NextResponse } from "next/server";

import { clearViewerSession } from "@/lib/session";
import { env } from "@/lib/env";

export async function GET() {
  await clearViewerSession();
  return NextResponse.redirect(new URL("/", env.appUrl()));
}
