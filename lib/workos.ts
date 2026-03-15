import "server-only";

import { WorkOS } from "@workos-inc/node";

import { env } from "@/lib/env";

export const getWorkos = () => new WorkOS(env.workosApiKey());

export const buildWorkosAuthorizeUrl = (state: string) =>
  getWorkos().userManagement.getAuthorizationUrl({
    clientId: env.workosClientId(),
    redirectUri: env.workosRedirectUri(),
    state,
    provider: "authkit",
    screenHint: "sign-in"
  });
