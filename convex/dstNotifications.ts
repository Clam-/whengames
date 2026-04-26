import { internalMutation } from "./_generated/server";

/**
 * DST Notification System - Placeholder Implementation
 *
 * This module contains the mechanism for detecting upcoming DST changes
 * and calculating which users would be impacted. At a later date,
 * actual email integration will be added.
 *
 * How it works:
 * 1. A daily cron job (defined in crons.ts) triggers checkUpcomingDstChanges
 * 2. For each recurring schedule, we check all participants' timezones
 * 3. We determine if any participant's timezone has a DST transition
 *    within the next 7 days
 * 4. If so, we log the notification (placeholder for email sending)
 *    - The impacted user gets notified
 *    - The schedule creator also gets notified about which users are impacted
 */

// Known DST transition dates for common timezones
// In production, this would use a timezone database (e.g., IANA tzdata)
// to dynamically determine upcoming transitions
function getNextDstTransition(
  timezone: string,
  fromDate: Date
): { date: Date; type: "spring-forward" | "fall-back" } | null {
  // Check the next 14 days for a UTC offset change
  const checkDate = new Date(fromDate);
  const initialOffset = getUtcOffset(timezone, checkDate);

  for (let i = 1; i <= 14; i++) {
    const nextDate = new Date(fromDate);
    nextDate.setDate(nextDate.getDate() + i);
    const nextOffset = getUtcOffset(timezone, nextDate);

    if (nextOffset !== initialOffset) {
      return {
        date: nextDate,
        type: nextOffset > initialOffset ? "spring-forward" : "fall-back",
      };
    }
  }

  return null;
}

// Get UTC offset for a timezone on a given date
function getUtcOffset(timezone: string, date: Date): number {
  try {
    const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzDate = new Date(
      date.toLocaleString("en-US", { timeZone: timezone })
    );
    return (tzDate.getTime() - utcDate.getTime()) / 60000; // offset in minutes
  } catch {
    return 0;
  }
}

// Calculate which users are impacted by an upcoming DST change
function calculateImpactedUsers(
  participantTimezones: { profileId: string; timezone: string }[],
  creatorTimezone: string,
  checkDate: Date
): {
  profileId: string;
  timezone: string;
  dstDate: Date;
  type: string;
  impact: string;
}[] {
  const impacted: {
    profileId: string;
    timezone: string;
    dstDate: Date;
    type: string;
    impact: string;
  }[] = [];

  for (const participant of participantTimezones) {
    const transition = getNextDstTransition(participant.timezone, checkDate);

    if (transition) {
      const daysDiff = Math.ceil(
        (transition.date.getTime() - checkDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff <= 7) {
        // Determine impact description
        const offsetChange =
          transition.type === "spring-forward"
            ? "will move forward 1 hour"
            : "will move back 1 hour";

        impacted.push({
          profileId: participant.profileId,
          timezone: participant.timezone,
          dstDate: transition.date,
          type: transition.type,
          impact: `Timezone ${participant.timezone} ${offsetChange} on ${transition.date.toISOString().split("T")[0]}. ` +
            `Scheduled times relative to ${creatorTimezone} may appear shifted.`,
        });
      }
    }
  }

  // Also check if the creator's timezone is changing
  const creatorTransition = getNextDstTransition(creatorTimezone, checkDate);
  if (creatorTransition) {
    const daysDiff = Math.ceil(
      (creatorTransition.date.getTime() - checkDate.getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (daysDiff <= 7) {
      // All participants are impacted when creator's timezone changes
      for (const participant of participantTimezones) {
        if (
          !impacted.find(
            (i) =>
              i.profileId === participant.profileId &&
              i.dstDate.getTime() === creatorTransition.date.getTime()
          )
        ) {
          impacted.push({
            profileId: participant.profileId,
            timezone: participant.timezone,
            dstDate: creatorTransition.date,
            type: creatorTransition.type,
            impact: `The schedule creator's timezone (${creatorTimezone}) is changing DST. ` +
              `Locked-in times may appear shifted in your timezone (${participant.timezone}).`,
          });
        }
      }
    }
  }

  return impacted;
}

// Main cron handler: check all recurring schedules for DST impacts
export const checkUpcomingDstChanges = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date();

    // Get all recurring schedules
    const schedules = await ctx.db.query("schedules").collect();
    const recurringSchedules = schedules.filter((s) => s.type === "recurring");

    for (const schedule of recurringSchedules) {
      // Get all selections for this schedule to find participants
      const selections = await ctx.db
        .query("selections")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
        .collect();

      // Get unique participant profiles
      const participantProfileIds = [
        ...new Set(selections.map((s) => s.profileId)),
      ];

      const participantTimezones: { profileId: string; timezone: string }[] = [];

      for (const profileId of participantProfileIds) {
        const profile = await ctx.db.get(profileId);
        if (profile && profile.dstNotifications) {
          participantTimezones.push({
            profileId: profileId as string,
            timezone: profile.timezone as string,
          });
        }
      }

      if (participantTimezones.length === 0) continue;

      // Calculate who is impacted
      const impactedUsers = calculateImpactedUsers(
        participantTimezones,
        schedule.creatorTimezone,
        now
      );

      // Log notifications (placeholder for actual email sending)
      for (const impact of impactedUsers) {
        // Check if we already notified this user for this DST change
        const dstDateStr = impact.dstDate.toISOString().split("T")[0];
        const existing = await ctx.db
          .query("dstCheckLog")
          .withIndex("by_schedule_profile_date", (q) =>
            q
              .eq("scheduleId", schedule._id)
              .eq("profileId", impact.profileId as any)
              .eq("dstChangeDate", dstDateStr)
          )
          .first();

        if (!existing) {
          // Log the notification
          await ctx.db.insert("dstCheckLog", {
            scheduleId: schedule._id,
            profileId: impact.profileId as any,
            dstChangeDate: dstDateStr,
            notifiedAt: Date.now(),
            impactDescription: impact.impact,
          });

          // ============================================
          // PLACEHOLDER: Send email notification
          // ============================================
          // TODO: Integrate with email service (e.g., SendGrid, SES, Resend)
          //
          // sendEmail({
          //   to: userEmail,
          //   subject: `[When games?] DST change affecting "${schedule.title}"`,
          //   body: impact.impact,
          // });
          //
          // Also notify the schedule creator:
          // sendEmail({
          //   to: creatorEmail,
          //   subject: `[When games?] DST change affecting participant in "${schedule.title}"`,
          //   body: `User ${userName} (${impact.timezone}) will be affected by DST: ${impact.impact}`,
          // });
          // ============================================

          console.log(
            `[DST Notification Placeholder] Schedule: ${schedule.title}, ` +
              `User: ${impact.profileId}, Impact: ${impact.impact}`
          );
        }
      }
    }
  },
});
