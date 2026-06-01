// Pure helpers for Discord integration: signature verification, formatting,
// REST API wrappers. Kept side-effect free so they can be imported by the
// V8 runtime (http.ts) and node runtime alike.

import { DateTime } from "luxon";

// ---------------------------------------------------------------------------
// Ed25519 signature verification (Discord requirement for interaction webhooks)
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): ArrayBuffer {
  const buf = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buf);
  for (let i = 0; i < view.length; i++) {
    view[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return buf;
}

export async function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string
): Promise<boolean> {
  try {
    const publicKey = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKeyHex),
      // Ed25519 in WebCrypto is supported in modern V8 runtimes.
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      false,
      ["verify"]
    );
    const message = new TextEncoder().encode(timestamp + body)
      .buffer as ArrayBuffer;
    return await crypto.subtle.verify(
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      publicKey,
      hexToBytes(signatureHex),
      message
    );
  } catch (err) {
    console.error("Discord signature verification failed", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Discord REST API helpers
// ---------------------------------------------------------------------------

const DISCORD_API = "https://discord.com/api/v10";

function authHeader(): Record<string, string> {
  return {
    Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export async function postChannelMessage(
  channelId: string,
  payload: Record<string, unknown>
): Promise<{ id: string } | null> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error("postChannelMessage failed", res.status, await res.text());
    return null;
  }
  return (await res.json()) as { id: string };
}

export async function editChannelMessage(
  channelId: string,
  messageId: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const res = await fetch(
    `${DISCORD_API}/channels/${channelId}/messages/${messageId}`,
    {
      method: "PATCH",
      headers: authHeader(),
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    console.error("editChannelMessage failed", res.status, await res.text());
    return false;
  }
  return true;
}

export async function fetchGuildChannels(
  guildId: string
): Promise<{ id: string; name: string; type: number }[]> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    headers: authHeader(),
  });
  if (!res.ok) {
    console.error("fetchGuildChannels failed", res.status, await res.text());
    return [];
  }
  const data = (await res.json()) as Array<{
    id: string;
    name: string;
    type: number;
  }>;
  // 0 = GUILD_TEXT, 5 = GUILD_ANNOUNCEMENT — the channel types the bot can send to
  return data
    .filter((c) => c.type === 0 || c.type === 5)
    .map((c) => ({ id: c.id, name: c.name, type: c.type }));
}

export async function fetchGuildInfo(
  guildId: string
): Promise<{ name?: string } | null> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}`, {
    headers: authHeader(),
  });
  if (!res.ok) return null;
  return (await res.json()) as { name?: string };
}

// ---------------------------------------------------------------------------
// Summary formatting — used by the linking flow + debounced updates
// ---------------------------------------------------------------------------

export type SelectionState = "can-do" | "cant-do" | "maybe";
export type SummaryInput = {
  schedule: {
    _id: string;
    title: string;
    description?: string;
    type: "one-off" | "recurring";
    creatorTimezone: string;
    lockedSlots?: { dayKey: string; timeSlot: string }[];
    isLocked?: boolean;
  };
  // (profileId -> displayName)
  profileNames: Record<string, string>;
  // ALL selections (non-link generated) for the schedule
  selections: {
    profileId: string;
    dayKey: string;
    timeSlot: string;
    state: SelectionState;
    isException?: boolean;
  }[];
  // Where to point the View Schedule button
  appBaseUrl: string;
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatSlotLabel(
  scheduleType: "one-off" | "recurring",
  dayKey: string,
  timeSlot: string
): string {
  if (scheduleType === "recurring") {
    const dow = parseInt(dayKey, 10);
    const name = DAY_NAMES[dow] ?? `Day ${dayKey}`;
    return `${name} ${timeSlot}`;
  }
  const dt = DateTime.fromISO(dayKey);
  return `${dt.toFormat("EEE MMM d")} ${timeSlot}`;
}

/** Build a snapshot string used to detect "did anything meaningful change" */
export function buildLockedSlotSnapshot(input: SummaryInput): string {
  const locked = input.schedule.lockedSlots ?? [];
  // Sort for stability
  const sortedLocked = [...locked].sort((a, b) =>
    (a.dayKey + a.timeSlot).localeCompare(b.dayKey + b.timeSlot)
  );

  const lines: string[] = [];
  for (const slot of sortedLocked) {
    const participants = input.selections
      .filter(
        (s) =>
          !s.isException &&
          s.dayKey === slot.dayKey &&
          s.timeSlot === slot.timeSlot
      )
      .map((s) => `${s.profileId}:${s.state}`)
      .sort();
    lines.push(`${slot.dayKey}|${slot.timeSlot}|${participants.join(",")}`);
  }
  return lines.join("\n");
}

/**
 * Build a Discord interaction payload (used both for follow-up sends and
 * for the response data when a user clicks "Send" in the slash command).
 *
 * Returns the `data` object that can be plugged into either
 *   { type: 4, data: ... }  (interaction response)
 *   or a POST /channels/{id}/messages body.
 */
export function buildSummaryMessage(
  input: SummaryInput
): Record<string, unknown> {
  const { schedule, profileNames, selections } = input;
  const lockedSlots = schedule.lockedSlots ?? [];

  // Build "Locked Times" field
  let lockedField = "";
  if (lockedSlots.length === 0) {
    lockedField = "_No locked-in times yet._";
  } else {
    const lockedLines = lockedSlots
      .slice()
      .sort((a, b) =>
        (a.dayKey + a.timeSlot).localeCompare(b.dayKey + b.timeSlot)
      )
      .map((slot) => {
        const label = formatSlotLabel(schedule.type, slot.dayKey, slot.timeSlot);
        // Show who can / can't make this slot
        const canDo: string[] = [];
        const cantDo: string[] = [];
        const maybe: string[] = [];
        for (const s of selections) {
          if (s.isException) continue;
          if (s.dayKey !== slot.dayKey || s.timeSlot !== slot.timeSlot) continue;
          const name = profileNames[s.profileId] ?? "?";
          if (s.state === "can-do") canDo.push(name);
          else if (s.state === "cant-do") cantDo.push(name);
          else maybe.push(name);
        }
        const parts: string[] = [];
        if (canDo.length) parts.push(`✅ ${canDo.join(", ")}`);
        if (maybe.length) parts.push(`❔ ${maybe.join(", ")}`);
        if (cantDo.length) parts.push(`❌ ${cantDo.join(", ")}`);
        const detail = parts.length ? `\n  ${parts.join(" · ")}` : "";
        return `🔒 **${label}**${detail}`;
      });
    lockedField = lockedLines.join("\n\n");
  }

  // Build "Top Nominations" field — most-popular cells
  const tally = new Map<string, { dayKey: string; timeSlot: string; canDo: string[]; maybe: string[] }>();
  for (const s of selections) {
    if (s.isException) continue;
    if (s.state === "cant-do") continue;
    const key = `${s.dayKey}|${s.timeSlot}`;
    const entry = tally.get(key) ?? {
      dayKey: s.dayKey,
      timeSlot: s.timeSlot,
      canDo: [],
      maybe: [],
    };
    const name = profileNames[s.profileId] ?? "?";
    if (s.state === "can-do") entry.canDo.push(name);
    else if (s.state === "maybe") entry.maybe.push(name);
    tally.set(key, entry);
  }
  const sortedTally = [...tally.values()]
    .map((e) => ({ ...e, score: e.canDo.length * 2 + e.maybe.length }))
    .sort((a, b) => b.score - a.score || (a.dayKey + a.timeSlot).localeCompare(b.dayKey + b.timeSlot))
    .slice(0, 5);

  let nominationsField = "";
  if (sortedTally.length === 0) {
    nominationsField = "_No nominations yet._";
  } else {
    nominationsField = sortedTally
      .map((e) => {
        const label = formatSlotLabel(schedule.type, e.dayKey, e.timeSlot);
        const parts: string[] = [];
        if (e.canDo.length) parts.push(`✅ ${e.canDo.join(", ")}`);
        if (e.maybe.length) parts.push(`❔ ${e.maybe.join(", ")}`);
        return `**${label}** — ${parts.join(" · ")}`;
      })
      .join("\n");
  }

  const url = `${input.appBaseUrl}/schedule/${schedule._id}`;

  const embed: Record<string, unknown> = {
    title: schedule.title,
    url,
    description: schedule.description || undefined,
    color: schedule.isLocked ? 0x8b5cf6 : 0x3b82f6,
    fields: [
      { name: "Locked-in times", value: lockedField || "—", inline: false },
      { name: "Top nominations", value: nominationsField || "—", inline: false },
    ],
    footer: { text: `Schedule type: ${schedule.type}` },
    timestamp: new Date().toISOString(),
  };

  return {
    embeds: [embed],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5, // link button
            label: "Open in When?",
            url,
          },
        ],
      },
    ],
  };
}
