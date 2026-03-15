"use node";

import nodemailer from "nodemailer";

import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { nextDstTransitionWithinDays } from "../lib/time";

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

export const pendingDstNotices = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [users, schedules, selectedSlots] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("schedules").collect(),
      ctx.db.query("selectedSlots").collect()
    ]);

    const selectedBySchedule = new Map<string, typeof selectedSlots>();
    for (const row of selectedSlots) {
      const key = row.scheduleId;
      const existing = selectedBySchedule.get(key) ?? [];
      existing.push(row);
      selectedBySchedule.set(key, existing);
    }

    return users
      .filter((user) => user.kind === "sso" && user.email && user.dstNotifications)
      .map((user) => {
        const transition = nextDstTransitionWithinDays(user.timezone, 7);
        if (!transition) {
          return null;
        }
        const impactedSchedules = schedules
          .filter((schedule) => schedule.kind === "weekly")
          .filter((schedule) => (selectedBySchedule.get(schedule._id)?.length ?? 0) > 0)
          .map((schedule) => ({
            title: schedule.title,
            slug: schedule.slug,
            timezone: schedule.timezone
          }));

        if (!impactedSchedules.length) {
          return null;
        }

        return {
          email: user.email,
          displayName: user.displayName,
          timezone: user.timezone,
          transitionDate: transition.transitionDate,
          impactedSchedules
        };
      })
      .filter(Boolean);
  }
});

export const sendDailyDstNotices = internalAction({
  args: {},
  handler: async (ctx) => {
    if (!canSendMail()) {
      return { sent: 0, skipped: true };
    }

    const notices = (await ctx.runQuery(internal.notifications.pendingDstNotices, {})) as Array<{
      email: string;
      displayName: string;
      timezone: string;
      transitionDate: string;
      impactedSchedules: Array<{ title: string; slug: string }>;
    }>;
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
