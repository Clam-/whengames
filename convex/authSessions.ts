import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const createSession = internalMutation({
  args: {
    sessionToken: v.string(),
    refreshToken: v.string(),
    googleUserId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("authSessions", {
      sessionToken: args.sessionToken,
      refreshToken: args.refreshToken,
      googleUserId: args.googleUserId,
      createdAt: Date.now(),
    });
  },
});

export const getBySessionToken = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("authSessions")
      .withIndex("by_sessionToken", (q) =>
        q.eq("sessionToken", args.sessionToken),
      )
      .unique();
  },
});

export const getRefreshTokenByGoogleUser = internalQuery({
  args: { googleUserId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("authSessions")
      .withIndex("by_googleUserId", (q) =>
        q.eq("googleUserId", args.googleUserId),
      )
      .order("desc")
      .first();
    if (!session) return null;
    return { refreshToken: session.refreshToken };
  },
});

export const deleteBySessionToken = internalMutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("authSessions")
      .withIndex("by_sessionToken", (q) =>
        q.eq("sessionToken", args.sessionToken),
      )
      .unique();
    if (session) {
      await ctx.db.delete(session._id);
    }
  },
});
