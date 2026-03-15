import { internalQuery } from "./_generated/server";
import { nextDstTransitionWithinDays } from "../lib/time";

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
