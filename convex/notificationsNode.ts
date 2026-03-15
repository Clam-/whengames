"use node";

import nodemailer from "nodemailer";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

type PendingDstNotice = {
  email: string;
  displayName: string;
  timezone: string;
  transitionDate: string;
  impactedSchedules: Array<{ title: string; slug: string }>;
};

const canSendMail = () =>
  Boolean(
    process.env.MAIL_FROM &&
      process.env.MAIL_HOST &&
      process.env.MAIL_OAUTH_USER &&
      process.env.MAIL_OAUTH_CLIENT_ID &&
      process.env.MAIL_OAUTH_CLIENT_SECRET &&
      process.env.MAIL_OAUTH_REFRESH_TOKEN
  );

const createMailer = () =>
  nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT ?? "587"),
    secure: process.env.MAIL_SECURE === "true",
    auth: {
      type: "OAuth2",
      user: process.env.MAIL_OAUTH_USER,
      clientId: process.env.MAIL_OAUTH_CLIENT_ID,
      clientSecret: process.env.MAIL_OAUTH_CLIENT_SECRET,
      refreshToken: process.env.MAIL_OAUTH_REFRESH_TOKEN,
      accessToken: process.env.MAIL_OAUTH_ACCESS_TOKEN
    }
  });

export const sendDailyDstNotices = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!canSendMail()) {
      return { sent: 0, skipped: true };
    }

    const notices = (await ctx.runQuery(internal.notifications.pendingDstNotices, {})) as PendingDstNotice[];
    const transport = createMailer();

    for (const notice of notices) {
      await transport.sendMail({
        from: process.env.MAIL_FROM,
        to: notice.email,
        subject: `DST change reminder for ${notice.displayName}`,
        text: [
          `Your timezone (${notice.timezone}) changes on ${notice.transitionDate}.`,
          "",
          "These schedule selections may shift for other participants:",
          ...notice.impactedSchedules.map((schedule) => `- ${schedule.title}: /schedules/${schedule.slug}`)
        ].join("\n")
      });
    }

    return { sent: notices.length, skipped: false };
  }
});
