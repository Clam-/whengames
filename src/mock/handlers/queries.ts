/**
 * Mock query handlers for design mode.
 *
 * Each handler mirrors the return shape of its real Convex query function.
 */

import * as store from "../store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (args: Args) => any;

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

function currentUserProfile(args: Args) {
  const profiles = store.query("userProfiles");

  // Anonymous path (no auth in design mode)
  if (args.anonymousId) {
    const profile = profiles.find((p) => p.anonymousId === args.anonymousId);
    if (profile) {
      return {
        ...profile,
        isAuthenticated: false,
        authType: "anonymous",
        ssoName: undefined,
        ssoEmail: undefined,
        ssoImage: undefined,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// schedules
// ---------------------------------------------------------------------------

function schedulesList() {
  const schedules = store
    .query("schedules")
    .filter((s) => !s.isPrivate)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  return schedules.map((schedule) => {
    const creator = store.get("userProfiles", schedule.creatorProfileId);
    return {
      ...schedule,
      creatorName: creator?.displayName ?? "Unknown",
      creatorImage: creator?.profileImageUrl,
    };
  });
}

function schedulesGet(args: Args) {
  const schedule = store.get("schedules", args.scheduleId);
  if (!schedule) return null;

  const creator = store.get("userProfiles", schedule.creatorProfileId);

  // Get selections for this schedule
  const allSelections = store
    .query("selections")
    .filter((s) => s.scheduleId === args.scheduleId);

  // Get availability links for this schedule
  const links = store
    .query("availabilityLinks")
    .filter((l) => l.scheduleId === args.scheduleId);

  const linkedProfileIds = new Set(links.map((l: { profileId: string }) => l.profileId));

  // Filter out non-exception selections for linked profiles
  let filteredSelections = allSelections;
  if (links.length > 0) {
    filteredSelections = allSelections.filter((sel) => {
      if (linkedProfileIds.has(sel.profileId)) {
        return sel.isException === true;
      }
      return true;
    });
  }

  // Build virtual selections from linked saved availabilities
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const virtualSelections: any[] = [];
  const availabilityLinkInfo: {
    profileId: string;
    savedAvailabilityId: string;
    savedAvailabilityName: string;
  }[] = [];

  for (const link of links) {
    const savedAvail = store.get("savedAvailabilities", link.savedAvailabilityId);
    if (!savedAvail) continue;

    availabilityLinkInfo.push({
      profileId: link.profileId,
      savedAvailabilityId: link.savedAvailabilityId,
      savedAvailabilityName: savedAvail.name,
    });

    for (const slot of savedAvail.slots) {
      virtualSelections.push({
        _id: `virtual_${link._id}_${slot.dayKey}_${slot.timeSlot}`,
        scheduleId: args.scheduleId,
        profileId: link.profileId,
        dayKey: slot.dayKey,
        timeSlot: slot.timeSlot,
        timezone: savedAvail.timezone,
        state: slot.state,
      });
    }
  }

  // Normalize selections
  const normalizedSelections = filteredSelections.map((s) => ({
    _id: s._id,
    scheduleId: s.scheduleId,
    profileId: s.profileId,
    dayKey: s.dayKey,
    timeSlot: s.timeSlot,
    timezone: s.timezone,
    state: s.state,
    isException: s.isException,
    exceptionDate: s.exceptionDate,
  }));

  const selections = [...normalizedSelections, ...virtualSelections];

  // Collect unique profile IDs from selections + links
  const profileIdSet = new Set<string>();
  for (const sel of selections) profileIdSet.add(sel.profileId);
  for (const link of links) profileIdSet.add(link.profileId);

  const profiles = [...profileIdSet]
    .map((id) => {
      const profile = store.get("userProfiles", id);
      if (!profile) return null;
      return {
        _id: profile._id,
        displayName: profile.displayName,
        profileImageUrl: profile.profileImageUrl,
        timezone: profile.timezone,
      };
    })
    .filter(Boolean);

  // Blocked profiles
  const blockedProfiles = store
    .query("blockedProfiles")
    .filter((b) => b.scheduleId === args.scheduleId);
  const blockedProfileIds = blockedProfiles.map((b) => b.profileId);

  return {
    ...schedule,
    creatorName: creator?.displayName ?? "Unknown",
    creatorImage: creator?.profileImageUrl,
    creatorTimezoneStored: creator?.timezone ?? schedule.creatorTimezone,
    selections,
    profiles,
    availabilityLinks: availabilityLinkInfo,
    blockedProfileIds,
  };
}

function getBlockedProfiles(args: Args) {
  const blocked = store
    .query("blockedProfiles")
    .filter((b) => b.scheduleId === args.scheduleId);

  return blocked.map((b) => {
    const profile = store.get("userProfiles", b.profileId);
    return {
      ...b,
      displayName: profile?.displayName ?? "Unknown",
      profileImageUrl: profile?.profileImageUrl,
    };
  });
}

// ---------------------------------------------------------------------------
// savedAvailabilities
// ---------------------------------------------------------------------------

function listForProfile(args: Args) {
  return store
    .query("savedAvailabilities")
    .filter((s) => s.profileId === args.profileId);
}

// ---------------------------------------------------------------------------
// Export handler map
// ---------------------------------------------------------------------------

export const queryHandlers: Record<string, Handler> = {
  "users:currentUserProfile": currentUserProfile,
  "schedules:list": schedulesList,
  "schedules:get": schedulesGet,
  "schedules:getBlockedProfiles": getBlockedProfiles,
  "savedAvailabilities:listForProfile": listForProfile,
};
