import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const middleware = (request: NextRequest) => {
  const response = NextResponse.next();
  response.headers.set("Accept-CH", "Sec-CH-Timezone");
  response.headers.set("Critical-CH", "Sec-CH-Timezone");

  const explicitTimezone = request.headers.get("sec-ch-timezone");
  if (explicitTimezone) {
    response.headers.set("x-timezone", explicitTimezone);
  }
  return response;
};

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
