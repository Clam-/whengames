import "server-only";

import { WorkOS } from "@workos-inc/node";

import { env } from "@/lib/env";

export const getWorkos = () => new WorkOS(env.workosApiKey());

export const buildWorkosAuthorizeUrl = (state: string) =>
  getWorkos().sso.getAuthorizationUrl({
    connection: env.workosConnectionId(),
    clientId: env.workosClientId(),
    redirectUri: env.workosRedirectUri(),
    state
  });
