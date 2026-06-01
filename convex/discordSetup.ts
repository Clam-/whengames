import { v } from "convex/values";
import { action } from "./_generated/server";

/**
 * One-shot registration action — run from the Convex dashboard or with
 *   npx convex run discordSetup:registerCommands
 *
 * Registers the global `/when` slash command on Discord. You only need
 * to run this when the command definition changes (rare). Global
 * command propagation can take up to an hour the first time; for
 * faster iteration during setup, register against a guild instead
 * using `registerGuildCommands`.
 *
 * Required env vars (set on the Convex deployment):
 *   DISCORD_APP_ID
 *   DISCORD_BOT_TOKEN
 */
export const registerCommands = action({
  args: {},
  handler: async () => {
    const appId = process.env.DISCORD_APP_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!appId || !botToken) {
      throw new Error("DISCORD_APP_ID and DISCORD_BOT_TOKEN must be set");
    }

    const command = {
      name: "when",
      description: "Share a When? schedule into this channel",
      type: 1,
    };

    const res = await fetch(
      `https://discord.com/api/v10/applications/${appId}/commands`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Discord registration failed (${res.status}): ${text}`);
    }
    return await res.json();
  },
});

/**
 * Register the command against a specific guild for fast iteration —
 * guild commands appear immediately and don't need to wait for the
 * global cache to propagate.
 */
export const registerGuildCommands = action({
  args: { guildId: v.string() },
  handler: async (_ctx, args) => {
    const appId = process.env.DISCORD_APP_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!appId || !botToken) {
      throw new Error("DISCORD_APP_ID and DISCORD_BOT_TOKEN must be set");
    }

    const command = {
      name: "when",
      description: "Share a When? schedule into this channel",
      type: 1,
    };

    const res = await fetch(
      `https://discord.com/api/v10/applications/${appId}/guilds/${args.guildId}/commands`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Discord registration failed (${res.status}): ${text}`);
    }
    return await res.json();
  },
});
