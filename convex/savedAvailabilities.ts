import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { auth } from "./auth";
import { Id } from "./_generated/dataModel";

// List saved availabilities for a profile
export const listForProfile = query({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("savedAvailabilities")
      .withIndex("by_profileId", (q) => q.eq("profileId", args.profileId))
      .collect();
  },
});

// Get availability link for a schedule/profile pair
export const getLinkForSchedule = query({
  args: {
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("availabilityLinks")
      .withIndex("by_schedule_profile", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
      )
      .unique();

    if (!link) return null;

    const savedAvail = await ctx.db.get(link.savedAvailabilityId);
    if (!savedAvail) return null;

    return {
      linkId: link._id,
      savedAvailabilityId: link.savedAvailabilityId,
      savedAvailabilityName: savedAvail.name,
    };
  },
});

// Helper: get effective current recurring slots for a profile on a schedule
async function getEffectiveSlots(
  ctx: { db: MutationCtx["db"] },
  scheduleId: Id<"schedules">,
  profileId: Id<"userProfiles">
): Promise<{ dayKey: string; timeSlot: string; state: "can-do" | "cant-do" | "maybe" }[]> {
  // Check if linked to a saved availability
  const existingLink = await ctx.db
    .query("availabilityLinks")
    .withIndex("by_schedule_profile", (q) =>
      q.eq("scheduleId", scheduleId).eq("profileId", profileId)
    )
    .unique();

  if (existingLink) {
    const linkedAvail = await ctx.db.get(existingLink.savedAvailabilityId);
    return linkedAvail?.slots || [];
  }

  // Not linked - get from selections
  const selections = await ctx.db
    .query("selections")
    .withIndex("by_schedule_profile", (q) =>
      q.eq("scheduleId", scheduleId).eq("profileId", profileId)
    )
    .collect();

  return selections
    .filter((s) => !s.isException)
    .map((s) => ({
      dayKey: s.dayKey,
      timeSlot: s.timeSlot,
      state: s.state,
    }));
}

// Save current schedule selections as a new saved availability and link it
export const saveNewAndLink = mutation({
  args: {
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
    name: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Get effective current slots
    const slots = await getEffectiveSlots(ctx, args.scheduleId, args.profileId);

    // Remove existing link if any (without copying back)
    const existingLink = await ctx.db
      .query("availabilityLinks")
      .withIndex("by_schedule_profile", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
      )
      .unique();
    if (existingLink) {
      await ctx.db.delete(existingLink._id);
    }

    // Delete non-exception selections (they'll be served by the saved availability)
    const selections = await ctx.db
      .query("selections")
      .withIndex("by_schedule_profile", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
      )
      .collect();
    for (const sel of selections) {
      if (!sel.isException) {
        await ctx.db.delete(sel._id);
      }
    }

    // Create saved availability
    const savedAvailId = await ctx.db.insert("savedAvailabilities", {
      profileId: args.profileId,
      name: args.name,
      timezone: args.timezone,
      slots,
    });

    // Create link
    await ctx.db.insert("availabilityLinks", {
      savedAvailabilityId: savedAvailId,
      scheduleId: args.scheduleId,
      profileId: args.profileId,
    });

    return savedAvailId;
  },
});

// Save/overwrite the default availability from current schedule and link it
export const saveOverwriteDefaultAndLink = mutation({
  args: {
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Get effective current slots
    const slots = await getEffectiveSlots(ctx, args.scheduleId, args.profileId);

    // Remove existing link if any (without copying back)
    const existingLink = await ctx.db
      .query("availabilityLinks")
      .withIndex("by_schedule_profile", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
      )
      .unique();
    if (existingLink) {
      await ctx.db.delete(existingLink._id);
    }

    // Delete non-exception selections
    const selections = await ctx.db
      .query("selections")
      .withIndex("by_schedule_profile", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
      )
      .collect();
    for (const sel of selections) {
      if (!sel.isException) {
        await ctx.db.delete(sel._id);
      }
    }

    // Find or create default availability
    const allSaved = await ctx.db
      .query("savedAvailabilities")
      .withIndex("by_profileId", (q) => q.eq("profileId", args.profileId))
      .collect();
    const existingDefault = allSaved.find((s) => s.isDefault === true);

    let savedAvailId: Id<"savedAvailabilities">;
    if (existingDefault) {
      await ctx.db.patch(existingDefault._id, {
        slots,
        timezone: args.timezone,
      });
      savedAvailId = existingDefault._id;
    } else {
      savedAvailId = await ctx.db.insert("savedAvailabilities", {
        profileId: args.profileId,
        name: "Default",
        isDefault: true,
        timezone: args.timezone,
        slots,
      });
    }

    // Create link
    await ctx.db.insert("availabilityLinks", {
      savedAvailabilityId: savedAvailId,
      scheduleId: args.scheduleId,
      profileId: args.profileId,
    });

    return savedAvailId;
  },
});

// Apply (link) an existing saved availability to a schedule
export const applyToSchedule = mutation({
  args: {
    savedAvailabilityId: v.id("savedAvailabilities"),
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Remove existing link if any
    const existingLink = await ctx.db
      .query("availabilityLinks")
      .withIndex("by_schedule_profile", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
      )
      .unique();
    if (existingLink) {
      await ctx.db.delete(existingLink._id);
    }

    // Delete non-exception selections (replaced by saved availability)
    const selections = await ctx.db
      .query("selections")
      .withIndex("by_schedule_profile", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
      )
      .collect();
    for (const sel of selections) {
      if (!sel.isException) {
        await ctx.db.delete(sel._id);
      }
    }

    // Create link
    await ctx.db.insert("availabilityLinks", {
      savedAvailabilityId: args.savedAvailabilityId,
      scheduleId: args.scheduleId,
      profileId: args.profileId,
    });
  },
});

// Unlink a saved availability from a schedule (copies slots back to selections)
export const unlinkFromSchedule = mutation({
  args: {
    scheduleId: v.id("schedules"),
    profileId: v.id("userProfiles"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const link = await ctx.db
      .query("availabilityLinks")
      .withIndex("by_schedule_profile", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("profileId", args.profileId)
      )
      .unique();

    if (!link) return;

    // Get the saved availability to copy slots back
    const savedAvail = await ctx.db.get(link.savedAvailabilityId);

    if (savedAvail) {
      for (const slot of savedAvail.slots) {
        await ctx.db.insert("selections", {
          scheduleId: args.scheduleId,
          profileId: args.profileId,
          dayKey: slot.dayKey,
          timeSlot: slot.timeSlot,
          timezone: savedAvail.timezone,
          state: slot.state,
        });
      }
    }

    // Delete the link
    await ctx.db.delete(link._id);
  },
});

// Delete a saved availability (unlinks from all schedules, copying slots back)
export const deleteSaved = mutation({
  args: {
    savedAvailabilityId: v.id("savedAvailabilities"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const savedAvail = await ctx.db.get(args.savedAvailabilityId);

    // Unlink from all schedules, copying slots back
    const links = await ctx.db
      .query("availabilityLinks")
      .withIndex("by_savedAvailability", (q) =>
        q.eq("savedAvailabilityId", args.savedAvailabilityId)
      )
      .collect();

    for (const link of links) {
      if (savedAvail) {
        for (const slot of savedAvail.slots) {
          await ctx.db.insert("selections", {
            scheduleId: link.scheduleId,
            profileId: link.profileId,
            dayKey: slot.dayKey,
            timeSlot: slot.timeSlot,
            timezone: savedAvail.timezone,
            state: slot.state,
          });
        }
      }
      await ctx.db.delete(link._id);
    }

    // Delete the saved availability
    if (savedAvail) {
      await ctx.db.delete(args.savedAvailabilityId);
    }
  },
});

// Rename a saved availability
export const renameSaved = mutation({
  args: {
    savedAvailabilityId: v.id("savedAvailabilities"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    await ctx.db.patch(args.savedAvailabilityId, { name: args.name });
  },
});

// Get linked schedule count for a saved availability
export const getLinkedScheduleCount = query({
  args: { savedAvailabilityId: v.id("savedAvailabilities") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("availabilityLinks")
      .withIndex("by_savedAvailability", (q) =>
        q.eq("savedAvailabilityId", args.savedAvailabilityId)
      )
      .collect();
    return links.length;
  },
});
