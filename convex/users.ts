import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const sanitizeDisplayName = (value: string) => value.trim().slice(0, 60) || "Anonymous player";

const publicUser = (user: Doc<"users">) => ({
  _id: user._id,
  displayName: user.displayName,
  avatarUrl: user.avatarUrl,
  email: user.email,
  timezone: user.timezone,
  weekStartsOn: user.weekStartsOn,
  dstNotifications: user.dstNotifications,
  kind: user.kind
});

export const ensureAnonymousViewer = mutation({
  args: {
    anonymousToken: v.string(),
    timezoneHint: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_anonymousToken", (query) => query.eq("anonymousToken", args.anonymousToken))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        timezone: args.timezoneHint ?? existing.timezone,
        lastSeenAt: Date.now()
      });
      return publicUser({ ...existing, timezone: args.timezoneHint ?? existing.timezone });
    }

    const userId = await ctx.db.insert("users", {
      kind: "anonymous",
      anonymousToken: args.anonymousToken,
      displayName: "Anonymous player",
      timezone: args.timezoneHint ?? "UTC",
      weekStartsOn: 0,
      dstNotifications: true,
      createdAt: Date.now(),
      lastSeenAt: Date.now()
    });
    const created = await ctx.db.get(userId);
    if (!created) {
      throw new Error("Failed to create anonymous viewer");
    }
    return publicUser(created);
  }
});

export const getViewer = query({
  args: {
    userId: v.optional(v.id("users"))
  },
  handler: async (ctx, args) => {
    if (!args.userId) {
      return null;
    }
    const user = await ctx.db.get(args.userId);
    if (!user || user.mergedIntoUserId) {
      return null;
    }
    return publicUser(user);
  }
});

export const saveViewerSettings = mutation({
  args: {
    userId: v.id("users"),
    displayName: v.string(),
    timezone: v.string(),
    weekStartsOn: v.number(),
    dstNotifications: v.boolean()
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }
    await ctx.db.patch(args.userId, {
      displayName: sanitizeDisplayName(args.displayName),
      timezone: args.timezone,
      weekStartsOn: args.weekStartsOn,
      dstNotifications: args.dstNotifications,
      lastSeenAt: Date.now()
    });
  }
});

export const upsertWorkosViewer = mutation({
  args: {
    anonymousUserId: v.optional(v.id("users")),
    anonymousToken: v.optional(v.string()),
    timezoneHint: v.optional(v.string()),
    workosUserId: v.string(),
    email: v.optional(v.string()),
    displayName: v.string(),
    avatarUrl: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const sourceUser = args.anonymousUserId ? await ctx.db.get(args.anonymousUserId) : null;
    let user = await ctx.db
      .query("users")
      .withIndex("by_workosUserId", (query) => query.eq("workosUserId", args.workosUserId))
      .unique();

    const now = Date.now();
    if (user) {
      await ctx.db.patch(user._id, {
        kind: "sso",
        email: args.email,
        displayName:
          sourceUser && sourceUser.displayName !== "Anonymous player"
            ? sanitizeDisplayName(sourceUser.displayName)
            : sanitizeDisplayName(args.displayName),
        avatarUrl: args.avatarUrl,
        timezone: sourceUser?.timezone ?? args.timezoneHint ?? user.timezone,
        weekStartsOn: sourceUser?.weekStartsOn ?? user.weekStartsOn,
        dstNotifications: sourceUser?.dstNotifications ?? user.dstNotifications,
        lastSeenAt: now
      });
      user = await ctx.db.get(user._id);
    } else {
      const userId = await ctx.db.insert("users", {
        kind: "sso",
        workosUserId: args.workosUserId,
        email: args.email,
        displayName:
          sourceUser && sourceUser.displayName !== "Anonymous player"
            ? sanitizeDisplayName(sourceUser.displayName)
            : sanitizeDisplayName(args.displayName),
        avatarUrl: args.avatarUrl,
        timezone: sourceUser?.timezone ?? args.timezoneHint ?? "UTC",
        weekStartsOn: sourceUser?.weekStartsOn ?? 0,
        dstNotifications: sourceUser?.dstNotifications ?? true,
        createdAt: now,
        lastSeenAt: now
      });
      user = await ctx.db.get(userId);
    }

    if (!user) {
      throw new Error("Unable to create SSO user");
    }

    if (args.anonymousUserId && args.anonymousUserId !== user._id) {
      await mergeUserData(ctx, args.anonymousUserId, user._id);
    }

    const refreshedUser = await ctx.db.get(user._id);
    if (!refreshedUser) {
      throw new Error("Unable to load SSO user");
    }
    return publicUser(refreshedUser);
  }
});

export const getUsersByIds = query({
  args: {
    userIds: v.array(v.id("users"))
  },
  handler: async (ctx, args) => {
    const users = await Promise.all(args.userIds.map((userId) => ctx.db.get(userId)));
    return users.filter(Boolean).map((user) => publicUser(user as Doc<"users">));
  }
});

const mergeUserData = async (ctx: MutationCtx, sourceUserId: Id<"users">, targetUserId: Id<"users">) => {
  const sourceUser = await ctx.db.get(sourceUserId);
  const targetUser = await ctx.db.get(targetUserId);

  if (!sourceUser || !targetUser || sourceUser.mergedIntoUserId) {
    return;
  }

  const scheduleRows = await ctx.db
    .query("schedules")
    .filter((query) => query.eq(query.field("createdByUserId"), sourceUserId))
    .collect();
  for (const schedule of scheduleRows) {
    await ctx.db.patch(schedule._id, { createdByUserId: targetUserId });
  }

  const availabilityRows = (await ctx.db.query("availability").collect()).filter(
    (entry) => entry.ownerUserId === sourceUserId
  );
  for (const entry of availabilityRows) {
    await ctx.db.patch(entry._id, { ownerUserId: targetUserId });
  }

  const selectedRows = await ctx.db.query("selectedSlots").collect();
  for (const entry of selectedRows.filter((row) => row.markedByUserId === sourceUserId)) {
    await ctx.db.patch(entry._id, { markedByUserId: targetUserId });
  }

  await ctx.db.patch(sourceUserId, {
    mergedIntoUserId: targetUserId,
    lastSeenAt: Date.now()
  });
};
