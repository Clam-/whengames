import "server-only";

const read = (name: string, fallback?: string) => {
  return process.env[name] ?? fallback ?? "";
};

export const env = {
  convexUrl: () => read("NEXT_PUBLIC_CONVEX_URL"),
  appUrl: () => read("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
  workosApiKey: () => read("WORKOS_API_KEY"),
  workosClientId: () => read("WORKOS_CLIENT_ID"),
  workosRedirectUri: () => read("WORKOS_REDIRECT_URI"),
  workosConnectionId: () => read("WORKOS_CONNECTION_ID"),
  sessionSecret: () => read("WORKOS_COOKIE_SECRET"),
  mailFrom: () => process.env.MAIL_FROM,
  mailHost: () => process.env.MAIL_HOST,
  mailPort: () => Number(process.env.MAIL_PORT ?? "587"),
  mailSecure: () => process.env.MAIL_SECURE === "true",
  mailOauthUser: () => process.env.MAIL_OAUTH_USER,
  mailOauthClientId: () => process.env.MAIL_OAUTH_CLIENT_ID,
  mailOauthClientSecret: () => process.env.MAIL_OAUTH_CLIENT_SECRET,
  mailOauthRefreshToken: () => process.env.MAIL_OAUTH_REFRESH_TOKEN,
  mailOauthAccessToken: () => process.env.MAIL_OAUTH_ACCESS_TOKEN
};
