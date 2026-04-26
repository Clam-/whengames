import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";
import { Doc, Id } from "./_generated/dataModel";

// Get or create an anonymous user profile
export const getOrCreateAnonymousProfile = mutation({
  args: {
    anonymousId: v.string(),
    displayName: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_anonymousId", (q) => q.eq("anonymousId", args.anonymousId))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("userProfiles", {
      anonymousId: args.anonymousId,
      displayName: args.displayName,
      timezone: args.timezone,
      weekStartDay: 0, // Sunday default
      dstNotifications: true,
    });
  },
});

// Get profile by anonymous ID
export const getProfileByAnonymousId = query({
  args: { anonymousId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userProfiles")
      .withIndex("by_anonymousId", (q) => q.eq("anonymousId", args.anonymousId))
      .unique();
  },
});

// Get profile by auth user ID
export const getProfileByAuthUserId = query({
  args: { authUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userProfiles")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", args.authUserId))
      .unique();
  },
});

// Get the currently authenticated user's profile
export const currentUserProfile = query({
  args: { anonymousId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);

    if (userId) {
      // Fetch SSO user info from the Convex Auth users table
      const authUser = await ctx.db.get(userId);

      // Authenticated user - find their profile
      const profile = await ctx.db
        .query("userProfiles")
        .withIndex("by_authUserId", (q) => q.eq("authUserId", userId))
        .unique();
      if (profile) {
        return {
          ...profile,
          isAuthenticated: true as const,
          authType: "sso" as const,
          ssoName: authUser?.name,
          ssoEmail: authUser?.email,
          ssoImage: authUser?.image,
        };
      }

      // Auth user exists but profile hasn't been linked yet (merge in progress).
      // Check if the anonymous profile exists and return it with SSO info.
      if (args.anonymousId) {
        const anonProfile = await ctx.db
          .query("userProfiles")
          .withIndex("by_anonymousId", (q) =>
            q.eq("anonymousId", args.anonymousId)
          )
          .unique();
        if (anonProfile) {
          return {
            ...anonProfile,
            isAuthenticated: true as const,
            authType: "sso" as const,
            ssoName: authUser?.name,
            ssoEmail: authUser?.email,
            ssoImage: authUser?.image,
          };
        }
      }

      // No profile at all yet — return SSO info so the UI can render
      return {
        _id: undefined as unknown as Id<"userProfiles">,
        displayName: authUser?.name ?? authUser?.email ?? "User",
        email: authUser?.email,
        profileImageUrl: authUser?.image,
        timezone: "UTC",
        weekStartDay: 0,
        dstNotifications: true,
        isAuthenticated: true as const,
        authType: "sso" as const,
        ssoName: authUser?.name,
        ssoEmail: authUser?.email,
        ssoImage: authUser?.image,
      };
    }

    // Fall back to anonymous profile
    if (args.anonymousId) {
      const profile = await ctx.db
        .query("userProfiles")
        .withIndex("by_anonymousId", (q) =>
          q.eq("anonymousId", args.anonymousId)
        )
        .unique();
      if (profile) {
        return {
          ...profile,
          isAuthenticated: false as const,
          authType: "anonymous" as const,
          ssoName: undefined as string | undefined,
          ssoEmail: undefined as string | undefined,
          ssoImage: undefined as string | undefined,
        };
      }
    }

    return null;
  },
});

// Update user profile
export const updateProfile = mutation({
  args: {
    profileId: v.id("userProfiles"),
    displayName: v.optional(v.string()),
    timezone: v.optional(v.string()),
    weekStartDay: v.optional(v.number()),
    dstNotifications: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { profileId, ...updates } = args;
    const cleanUpdates: Record<string, unknown> = {};
    if (updates.displayName !== undefined)
      cleanUpdates.displayName = updates.displayName;
    if (updates.timezone !== undefined)
      cleanUpdates.timezone = updates.timezone;
    if (updates.weekStartDay !== undefined)
      cleanUpdates.weekStartDay = updates.weekStartDay;
    if (updates.dstNotifications !== undefined)
      cleanUpdates.dstNotifications = updates.dstNotifications;

    await ctx.db.patch(profileId, cleanUpdates);
  },
});

// Merge anonymous user into authenticated user
export const mergeAnonymousToAuth = mutation({
  args: {
    anonymousId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Fetch user info from Convex Auth users table
    const authUser = await ctx.db.get(userId);
    const email = authUser?.email;
    const profileImageUrl = authUser?.image;
    const displayName = authUser?.name;

    // Check if auth user already has a profile
    const existingAuthProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", userId))
      .unique();

    // Find anonymous profile
    const anonProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_anonymousId", (q) =>
        q.eq("anonymousId", args.anonymousId)
      )
      .unique();

    if (existingAuthProfile && anonProfile) {
      // Both exist - merge anon selections into auth profile
      const allSelections = await ctx.db.query("selections").collect();
      const anonSelectionsFiltered = allSelections.filter(
        (s) => s.profileId === anonProfile._id
      );

      for (const sel of anonSelectionsFiltered) {
        const existingSel = allSelections.find(
          (s) =>
            s.profileId === existingAuthProfile._id &&
            s.scheduleId === sel.scheduleId &&
            s.dayKey === sel.dayKey &&
            s.timeSlot === sel.timeSlot
        );
        if (!existingSel) {
          await ctx.db.insert("selections", {
            scheduleId: sel.scheduleId,
            profileId: existingAuthProfile._id,
            dayKey: sel.dayKey,
            timeSlot: sel.timeSlot,
            timezone: sel.timezone,
            state: sel.state,
            isException: sel.isException,
            exceptionDate: sel.exceptionDate,
          });
        }
        await ctx.db.delete(sel._id);
      }

      // Update schedules created by anon to point to auth profile
      const allSchedules = await ctx.db.query("schedules").collect();
      for (const sched of allSchedules) {
        if (sched.creatorProfileId === anonProfile._id) {
          await ctx.db.patch(sched._id, {
            creatorProfileId: existingAuthProfile._id,
          });
        }
      }

      // Inherit anon display name if auth profile has no custom one
      if (anonProfile.displayName && !existingAuthProfile.displayName) {
        await ctx.db.patch(existingAuthProfile._id, {
          displayName: anonProfile.displayName,
          email,
          profileImageUrl,
        });
      } else {
        await ctx.db.patch(existingAuthProfile._id, {
          email,
          profileImageUrl,
        });
      }

      // Delete anonymous profile
      await ctx.db.delete(anonProfile._id);

      return existingAuthProfile._id;
    } else if (anonProfile) {
      // Only anon exists - upgrade it to authenticated
      await ctx.db.patch(anonProfile._id, {
        authUserId: userId,
        email,
        profileImageUrl,
        displayName: anonProfile.displayName || displayName || "User",
      });
      return anonProfile._id;
    } else {
      // No anon profile - create new auth profile
      return await ctx.db.insert("userProfiles", {
        authUserId: userId,
        displayName: displayName || "User",
        email,
        profileImageUrl,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        weekStartDay: 0,
        dstNotifications: true,
      });
    }
  },
});

// Create or get authenticated profile (called after Google sign-in)
export const ensureAuthProfile = mutation({
  args: {
    anonymousId: v.optional(v.string()),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Fetch user info from Convex Auth users table (populated by Google OAuth)
    const authUser = await ctx.db.get(userId);
    const email = authUser?.email;
    const profileImageUrl = authUser?.image;
    const displayName = authUser?.name;

    // Check if auth user already has a profile
    let authProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", userId))
      .unique();

    // Find anonymous profile if anonymousId provided
    let anonProfile = args.anonymousId
      ? await ctx.db
          .query("userProfiles")
          .withIndex("by_anonymousId", (q) =>
            q.eq("anonymousId", args.anonymousId)
          )
          .unique()
      : null;

    if (authProfile && anonProfile && authProfile._id !== anonProfile._id) {
      // Merge: move all anon data to auth profile
      const allSelections = await ctx.db.query("selections").collect();
      const anonSelections = allSelections.filter(
        (s) => s.profileId === anonProfile!._id
      );

      for (const sel of anonSelections) {
        const exists = allSelections.some(
          (s) =>
            s.profileId === authProfile!._id &&
            s.scheduleId === sel.scheduleId &&
            s.dayKey === sel.dayKey &&
            s.timeSlot === sel.timeSlot
        );
        if (!exists) {
          await ctx.db.insert("selections", {
            scheduleId: sel.scheduleId,
            profileId: authProfile!._id,
            dayKey: sel.dayKey,
            timeSlot: sel.timeSlot,
            timezone: sel.timezone,
            state: sel.state,
            isException: sel.isException,
            exceptionDate: sel.exceptionDate,
          });
        }
        await ctx.db.delete(sel._id);
      }

      // Reassign schedules
      const allSchedules = await ctx.db.query("schedules").collect();
      for (const sched of allSchedules) {
        if (sched.creatorProfileId === anonProfile._id) {
          await ctx.db.patch(sched._id, {
            creatorProfileId: authProfile._id,
          });
        }
      }

      // Inherit display name from anon if it was set
      if (anonProfile.displayName) {
        await ctx.db.patch(authProfile._id, {
          displayName: anonProfile.displayName,
          email,
          profileImageUrl,
        });
      } else {
        await ctx.db.patch(authProfile._id, {
          email,
          profileImageUrl,
        });
      }

      await ctx.db.delete(anonProfile._id);
      return authProfile._id;
    } else if (anonProfile && !authProfile) {
      // Upgrade anon to auth
      await ctx.db.patch(anonProfile._id, {
        authUserId: userId,
        email,
        profileImageUrl,
      });
      return anonProfile._id;
    } else if (authProfile) {
      // Already have auth profile, update email/image
      await ctx.db.patch(authProfile._id, {
        email: email ?? authProfile.email,
        profileImageUrl: profileImageUrl ?? authProfile.profileImageUrl,
      });
      return authProfile._id;
    } else {
      // Create new
      return await ctx.db.insert("userProfiles", {
        authUserId: userId,
        displayName: displayName || "User",
        email,
        profileImageUrl,
        timezone: args.timezone,
        weekStartDay: 0,
        dstNotifications: true,
      });
    }
  },
});

// Unlink SSO and convert back to anonymous/cookie-based account
export const unlinkSso = mutation({
  args: {
    profileId: v.id("userProfiles"),
    newAnonymousId: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");
    if (!profile.authUserId) throw new Error("Profile is not linked to SSO");

    // If display name is empty or not set, use the SSO name before unlinking
    const authUser = await ctx.db.get(
      profile.authUserId as Id<"users">
    );
    const ssoName = authUser?.name;

    const updates: Record<string, unknown> = {
      authUserId: undefined,
      anonymousId: args.newAnonymousId,
      email: undefined,
      profileImageUrl: undefined,
    };

    // If display name was cleared (to use SSO name), restore the SSO name
    if (!profile.displayName || profile.displayName.trim() === "") {
      updates.displayName = ssoName || "Anonymous";
    }

    await ctx.db.patch(args.profileId, updates);

    return { displayName: (updates.displayName as string) || profile.displayName };
  },
});

// Get a profile by ID
export const getProfile = query({
  args: { profileId: v.id("userProfiles") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.profileId);
  },
});

// Get multiple profiles by IDs
export const getProfiles = query({
  args: { profileIds: v.array(v.id("userProfiles")) },
  handler: async (ctx, args) => {
    const profiles = await Promise.all(
      args.profileIds.map((id) => ctx.db.get(id))
    );
    return profiles.filter(Boolean);
  },
});
