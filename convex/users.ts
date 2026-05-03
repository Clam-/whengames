import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

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

// Get profile by auth user ID (tokenIdentifier)
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
    const identity = await ctx.auth.getUserIdentity();

    if (identity) {
      const tokenIdentifier = identity.tokenIdentifier;

      // Authenticated user - find their profile
      const profile = await ctx.db
        .query("userProfiles")
        .withIndex("by_authUserId", (q) => q.eq("authUserId", tokenIdentifier))
        .unique();
      if (profile) {
        // Prefer Convex-stored image over hotlinked Google URL
        const storedImageUrl = profile.profileImageStorageId
          ? await ctx.storage.getUrl(profile.profileImageStorageId)
          : null;
        const resolvedImage = storedImageUrl ?? identity.pictureUrl;
        return {
          ...profile,
          isAuthenticated: true as const,
          authType: "sso" as const,
          ssoName: identity.name,
          ssoEmail: identity.email,
          ssoImage: resolvedImage,
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
          const storedImageUrl = anonProfile.profileImageStorageId
            ? await ctx.storage.getUrl(anonProfile.profileImageStorageId)
            : null;
          const resolvedImage = storedImageUrl ?? identity.pictureUrl;
          return {
            ...anonProfile,
            isAuthenticated: true as const,
            authType: "sso" as const,
            ssoName: identity.name,
            ssoEmail: identity.email,
            ssoImage: resolvedImage,
          };
        }
      }

      // No profile at all yet — return SSO info so the UI can render
      return {
        _id: undefined as unknown as Id<"userProfiles">,
        displayName: identity.name ?? identity.email ?? "User",
        email: identity.email,
        profileImageUrl: identity.pictureUrl,
        timezone: "UTC",
        weekStartDay: 0,
        dstNotifications: true,
        isAuthenticated: true as const,
        authType: "sso" as const,
        ssoName: identity.name,
        ssoEmail: identity.email,
        ssoImage: identity.pictureUrl,
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const tokenIdentifier = identity.tokenIdentifier;
    const email = identity.email;
    const profileImageUrl = identity.pictureUrl;
    const displayName = identity.name;

    // Check if auth user already has a profile
    const existingAuthProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", tokenIdentifier))
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

      // Schedule background download of Google profile image into Convex storage
      if (profileImageUrl) {
        await ctx.scheduler.runAfter(
          0,
          internal.profileImages.downloadAndStoreProfileImage,
          { profileId: existingAuthProfile._id, imageUrl: profileImageUrl }
        );
      }

      return existingAuthProfile._id;
    } else if (anonProfile) {
      // Only anon exists - upgrade it to authenticated
      await ctx.db.patch(anonProfile._id, {
        authUserId: tokenIdentifier,
        email,
        profileImageUrl,
        displayName: anonProfile.displayName || displayName || "User",
      });

      // Schedule background download of Google profile image into Convex storage
      if (profileImageUrl) {
        await ctx.scheduler.runAfter(
          0,
          internal.profileImages.downloadAndStoreProfileImage,
          { profileId: anonProfile._id, imageUrl: profileImageUrl }
        );
      }
      return anonProfile._id;
    } else {
      // No anon profile - create new auth profile
      const newProfileId = await ctx.db.insert("userProfiles", {
        authUserId: tokenIdentifier,
        displayName: displayName || "User",
        email,
        profileImageUrl,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        weekStartDay: 0,
        dstNotifications: true,
      });

      // Schedule background download of Google profile image into Convex storage
      if (profileImageUrl) {
        await ctx.scheduler.runAfter(
          0,
          internal.profileImages.downloadAndStoreProfileImage,
          { profileId: newProfileId, imageUrl: profileImageUrl }
        );
      }
      return newProfileId;
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const tokenIdentifier = identity.tokenIdentifier;
    const email = identity.email;
    const profileImageUrl = identity.pictureUrl;
    const displayName = identity.name;

    // Check if auth user already has a profile
    let authProfile = await ctx.db
      .query("userProfiles")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", tokenIdentifier))
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

      // Schedule background download of Google profile image into Convex storage
      if (profileImageUrl) {
        await ctx.scheduler.runAfter(
          0,
          internal.profileImages.downloadAndStoreProfileImage,
          { profileId: authProfile._id, imageUrl: profileImageUrl }
        );
      }
      return authProfile._id;
    } else if (anonProfile && !authProfile) {
      // Upgrade anon to auth
      await ctx.db.patch(anonProfile._id, {
        authUserId: tokenIdentifier,
        email,
        profileImageUrl,
      });

      // Schedule background download of Google profile image into Convex storage
      if (profileImageUrl) {
        await ctx.scheduler.runAfter(
          0,
          internal.profileImages.downloadAndStoreProfileImage,
          { profileId: anonProfile._id, imageUrl: profileImageUrl }
        );
      }
      return anonProfile._id;
    } else if (authProfile) {
      // Already have auth profile, update email/image
      await ctx.db.patch(authProfile._id, {
        email: email ?? authProfile.email,
        profileImageUrl: profileImageUrl ?? authProfile.profileImageUrl,
      });

      // Always re-download on sign-in to pick up any profile picture changes
      if (profileImageUrl) {
        await ctx.scheduler.runAfter(
          0,
          internal.profileImages.downloadAndStoreProfileImage,
          { profileId: authProfile._id, imageUrl: profileImageUrl }
        );
      }
      return authProfile._id;
    } else {
      // Create new
      const newProfileId = await ctx.db.insert("userProfiles", {
        authUserId: tokenIdentifier,
        displayName: displayName || "User",
        email,
        profileImageUrl,
        timezone: args.timezone,
        weekStartDay: 0,
        dstNotifications: true,
      });

      // Schedule background download of Google profile image into Convex storage
      if (profileImageUrl) {
        await ctx.scheduler.runAfter(
          0,
          internal.profileImages.downloadAndStoreProfileImage,
          { profileId: newProfileId, imageUrl: profileImageUrl }
        );
      }
      return newProfileId;
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

    // Get the current user's identity for the SSO name fallback
    const identity = await ctx.auth.getUserIdentity();
    const ssoName = identity?.name;

    // Clean up stored profile image from Convex storage
    if (profile.profileImageStorageId) {
      await ctx.storage.delete(profile.profileImageStorageId);
    }

    const updates: Record<string, unknown> = {
      authUserId: undefined,
      anonymousId: args.newAnonymousId,
      email: undefined,
      profileImageUrl: undefined,
      profileImageStorageId: undefined,
    };

    // If display name was cleared (to use SSO name), restore the SSO name
    if (!profile.displayName || profile.displayName.trim() === "") {
      updates.displayName = ssoName || "Anonymous";
    }

    await ctx.db.patch(args.profileId, updates);

    return { displayName: (updates.displayName as string) || profile.displayName };
  },
});

// Refresh the authenticated user's cached profile image if stale (>24 hours).
// Called by the frontend on each app access; the backend throttles to avoid
// redundant downloads. This catches profile-picture changes between sign-ins.
const PROFILE_IMAGE_REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export const refreshProfileImageIfNeeded = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;

    const tokenIdentifier = identity.tokenIdentifier;

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_authUserId", (q) => q.eq("authUserId", tokenIdentifier))
      .unique();
    if (!profile) return;

    // Throttle: skip if checked recently
    const now = Date.now();
    if (
      profile.profileImageLastCheckedAt &&
      now - profile.profileImageLastCheckedAt < PROFILE_IMAGE_REFRESH_INTERVAL
    ) {
      return;
    }

    // Use the current Google picture URL from the identity
    const imageUrl = identity.pictureUrl ?? profile.profileImageUrl;
    if (!imageUrl) return;

    // Stamp the throttle first so concurrent calls don't duplicate
    await ctx.db.patch(profile._id, {
      profileImageLastCheckedAt: now,
    });

    // Schedule the download
    await ctx.scheduler.runAfter(
      0,
      internal.profileImages.downloadAndStoreProfileImage,
      { profileId: profile._id, imageUrl }
    );
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
