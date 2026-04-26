import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// List all schedules (public)
export const list = query({
  args: {},
  handler: async (ctx) => {
    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();

    // Enrich with creator profile info
    const enriched = await Promise.all(
      schedules.map(async (schedule) => {
        const creator = await ctx.db.get(schedule.creatorProfileId);
        return {
          ...schedule,
          creatorName: creator?.displayName ?? "Unknown",
          creatorImage: creator?.profileImageUrl,
        };
      })
    );

    return enriched;
  },
});

// Get a single schedule with all its selections
export const get = query({
  args: { scheduleId: v.id("schedules") },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) return null;

    const creator = await ctx.db.get(schedule.creatorProfileId);

    // Get all selections for this schedule
    const selections = await ctx.db
      .query("selections")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();

    // Get all unique profile IDs from selections
    const profileIds = [...new Set(selections.map((s) => s.profileId))];
    const profilesRaw = await Promise.all(
      profileIds.map(async (id) => {
        const profile = await ctx.db.get(id);
        return profile
          ? {
              _id: profile._id,
              displayName: profile.displayName,
              profileImageUrl: profile.profileImageUrl,
              timezone: profile.timezone,
            }
          : null;
      })
    );
    const profiles = profilesRaw.filter(
      (p) => p !== null
    );

    return {
      ...schedule,
      creatorName: creator?.displayName ?? "Unknown",
      creatorImage: creator?.profileImageUrl,
      creatorTimezoneStored: creator?.timezone ?? schedule.creatorTimezone,
      selections,
      profiles,
    };
  },
});

// Create a new schedule
export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    type: v.union(v.literal("one-off"), v.literal("recurring")),
    creatorProfileId: v.id("userProfiles"),
    dateRangeStart: v.optional(v.string()),
    dateRangeEnd: v.optional(v.string()),
    recurringStartDate: v.optional(v.string()),
    creatorTimezone: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("schedules", {
      title: args.title,
      description: args.description,
      type: args.type,
      creatorProfileId: args.creatorProfileId,
      dateRangeStart: args.dateRangeStart,
      dateRangeEnd: args.dateRangeEnd,
      recurringStartDate: args.recurringStartDate,
      creatorTimezone: args.creatorTimezone,
      createdAt: Date.now(),
    });
  },
});

// Update schedule metadata
export const update = mutation({
  args: {
    scheduleId: v.id("schedules"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { scheduleId, ...updates } = args;
    const cleanUpdates: Record<string, unknown> = {};
    if (updates.title !== undefined) cleanUpdates.title = updates.title;
    if (updates.description !== undefined)
      cleanUpdates.description = updates.description;
    await ctx.db.patch(scheduleId, cleanUpdates);
  },
});

// Set disallowed time slots (creator allow/disallow mode)
// Also strips any locked slots that overlap with the newly disallowed set.
export const setDisallowedSlots = mutation({
  args: {
    scheduleId: v.id("schedules"),
    slots: v.array(
      v.object({
        dayKey: v.string(),
        timeSlot: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) return;

    // Build a set of the new disallowed keys for fast lookup
    const disallowedKeys = new Set(
      args.slots.map((s) => `${s.dayKey}|${s.timeSlot}`)
    );

    // Remove any locked slots that are now disallowed
    const currentLocked = schedule.lockedSlots || [];
    const filteredLocked = currentLocked.filter(
      (s) => !disallowedKeys.has(`${s.dayKey}|${s.timeSlot}`)
    );

    await ctx.db.patch(args.scheduleId, {
      disallowedSlots: args.slots,
      lockedSlots: filteredLocked,
    });
  },
});

// Lock in time slots (creator only)
// Filters out any slots that are currently disallowed.
export const setLockedSlots = mutation({
  args: {
    scheduleId: v.id("schedules"),
    slots: v.array(
      v.object({
        dayKey: v.string(),
        timeSlot: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) return;

    // Strip any disallowed slots from the lock request
    const disallowedKeys = new Set(
      (schedule.disallowedSlots || []).map(
        (s) => `${s.dayKey}|${s.timeSlot}`
      )
    );
    const filteredSlots = args.slots.filter(
      (s) => !disallowedKeys.has(`${s.dayKey}|${s.timeSlot}`)
    );

    await ctx.db.patch(args.scheduleId, {
      lockedSlots: filteredSlots,
      isLocked: true,
    });
  },
});

// Clear disallowed time slots (creator allow/disallow mode)
export const clearDisallowedSlots = mutation({
  args: {
    scheduleId: v.id("schedules"),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) return;

    await ctx.db.patch(args.scheduleId, {
      disallowedSlots: [],
    });
  },
});

// Clear locked time slots (creator lock mode)
export const clearLockedSlots = mutation({
  args: {
    scheduleId: v.id("schedules"),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) return;

    await ctx.db.patch(args.scheduleId, {
      lockedSlots: [],
      isLocked: false,
    });
  },
});
