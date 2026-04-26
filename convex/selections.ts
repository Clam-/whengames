import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Helper: check if a slot is in the schedule's disallowed list
function isSlotDisallowed(
  disallowedSlots: { dayKey: string; timeSlot: string }[] | undefined,
  dayKey: string,
  timeSlot: string
): boolean {
  if (!disallowedSlots) return false;
  return disallowedSlots.some(
    (s) => s.dayKey === dayKey && s.timeSlot === timeSlot
  );
}

// Set a single cell selection
export const set = mutation({
  args: {
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
    dayKey: v.string(),
    timeSlot: v.string(),
    timezone: v.string(),
    state: v.union(
      v.literal("can-do"),
      v.literal("cant-do"),
      v.literal("maybe")
    ),
    isException: v.optional(v.boolean()),
    exceptionDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Guard: reject nominations on disallowed cells
    const schedule = await ctx.db.get(args.scheduleId);
    if (
      schedule &&
      isSlotDisallowed(schedule.disallowedSlots, args.dayKey, args.timeSlot)
    ) {
      // Silently skip — pre-existing selections are kept, but new ones are blocked
      return null;
    }

    // Find existing selection(s) for this cell
    const existing = await ctx.db
      .query("selections")
      .withIndex("by_schedule_profile", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("dayKey"), args.dayKey),
          q.eq(q.field("timeSlot"), args.timeSlot),
          args.isException
            ? q.eq(q.field("isException"), true)
            : q.neq(q.field("isException"), true),
          args.exceptionDate
            ? q.eq(q.field("exceptionDate"), args.exceptionDate)
            : q.eq(q.field("exceptionDate"), undefined)
        )
      )
      .take(10);

    if (existing.length > 0) {
      // Update the first match
      await ctx.db.patch(existing[0]._id, {
        state: args.state,
        timezone: args.timezone,
      });
      // Clean up any duplicates
      for (let i = 1; i < existing.length; i++) {
        await ctx.db.delete(existing[i]._id);
      }
      return existing[0]._id;
    }

    return await ctx.db.insert("selections", {
      scheduleId: args.scheduleId,
      profileId: args.profileId,
      dayKey: args.dayKey,
      timeSlot: args.timeSlot,
      timezone: args.timezone,
      state: args.state,
      isException: args.isException,
      exceptionDate: args.exceptionDate,
    });
  },
});

// Remove a selection (set to blank)
export const remove = mutation({
  args: {
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
    dayKey: v.string(),
    timeSlot: v.string(),
    isException: v.optional(v.boolean()),
    exceptionDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Guard: reject changes on disallowed cells
    const schedule = await ctx.db.get(args.scheduleId);
    if (
      schedule &&
      isSlotDisallowed(schedule.disallowedSlots, args.dayKey, args.timeSlot)
    ) {
      return;
    }

    const existing = await ctx.db
      .query("selections")
      .withIndex("by_schedule_profile", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("dayKey"), args.dayKey),
          q.eq(q.field("timeSlot"), args.timeSlot),
          args.isException
            ? q.eq(q.field("isException"), true)
            : q.neq(q.field("isException"), true),
          args.exceptionDate
            ? q.eq(q.field("exceptionDate"), args.exceptionDate)
            : q.eq(q.field("exceptionDate"), undefined)
        )
      )
      .take(10);

    // Delete all matches (including any duplicates)
    for (const record of existing) {
      await ctx.db.delete(record._id);
    }
  },
});

// Batch set selections (for drag operations)
export const batchSet = mutation({
  args: {
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
    timezone: v.string(),
    selections: v.array(
      v.object({
        dayKey: v.string(),
        timeSlot: v.string(),
        state: v.union(
          v.literal("can-do"),
          v.literal("cant-do"),
          v.literal("maybe"),
          v.literal("blank")
        ),
        isException: v.optional(v.boolean()),
        exceptionDate: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Load schedule once to check disallowed slots
    const schedule = await ctx.db.get(args.scheduleId);
    const disallowed = schedule?.disallowedSlots;

    for (const sel of args.selections) {
      // Guard: skip disallowed cells
      if (isSlotDisallowed(disallowed, sel.dayKey, sel.timeSlot)) {
        continue;
      }

      // Find existing selection(s) for this cell
      const existing = await ctx.db
        .query("selections")
        .withIndex("by_schedule_profile", (q) =>
          q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("dayKey"), sel.dayKey),
            q.eq(q.field("timeSlot"), sel.timeSlot),
            sel.isException
              ? q.eq(q.field("isException"), true)
              : q.neq(q.field("isException"), true),
            sel.exceptionDate
              ? q.eq(q.field("exceptionDate"), sel.exceptionDate)
              : q.eq(q.field("exceptionDate"), undefined)
          )
        )
        .take(10);

      if (sel.state === "blank") {
        // Remove all matching selections (including any duplicates)
        for (const record of existing) {
          await ctx.db.delete(record._id);
        }
      } else if (existing.length > 0) {
        // Update the first match
        await ctx.db.patch(existing[0]._id, {
          state: sel.state,
          timezone: args.timezone,
        });
        // Clean up any duplicates
        for (let i = 1; i < existing.length; i++) {
          await ctx.db.delete(existing[i]._id);
        }
      } else {
        await ctx.db.insert("selections", {
          scheduleId: args.scheduleId,
          profileId: args.profileId,
          dayKey: sel.dayKey,
          timeSlot: sel.timeSlot,
          timezone: args.timezone,
          state: sel.state,
          isException: sel.isException,
          exceptionDate: sel.exceptionDate,
        });
      }
    }
  },
});

// Clear all selections for a profile on a schedule
export const clearForProfile = mutation({
  args: {
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
  },
  handler: async (ctx, args) => {
    // Fetch in batches and delete
    let deleted = 0;
    while (true) {
      const batch = await ctx.db
        .query("selections")
        .withIndex("by_schedule_profile", (q) =>
          q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
        )
        .take(100);

      if (batch.length === 0) break;

      for (const record of batch) {
        await ctx.db.delete(record._id);
        deleted++;
      }
    }
    return deleted;
  },
});

// Get all selections for a schedule
export const getBySchedule = query({
  args: { scheduleId: v.id("schedules") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("selections")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();
  },
});
