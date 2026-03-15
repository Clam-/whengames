import "server-only";

import nodemailer from "nodemailer";

import { env } from "@/lib/env";

export const canSendMail = () =>
  Boolean(
    env.mailFrom() &&
      env.mailHost() &&
      env.mailOauthUser() &&
      env.mailOauthClientId() &&
      env.mailOauthClientSecret() &&
      env.mailOauthRefreshToken()
  );

export const mailer = () =>
  nodemailer.createTransport({
    host: env.mailHost(),
    port: env.mailPort(),
    secure: env.mailSecure(),
    auth: {
      type: "OAuth2",
      user: env.mailOauthUser(),
      clientId: env.mailOauthClientId(),
      clientSecret: env.mailOauthClientSecret(),
      refreshToken: env.mailOauthRefreshToken(),
      accessToken: env.mailOauthAccessToken()
    }
  });
