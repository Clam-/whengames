import type { Id } from "@/convex/_generated/dataModel";

export type SlotState = "blank" | "can" | "maybe" | "cant";

export type ScheduleKind = "oneOff" | "weekly";

export type ViewerSession = {
  anonymousToken: string;
  userId?: Id<"users">;
  timezoneHint?: string;
  workosSession?: string;
};

export type PublicUser = {
  _id: Id<"users">;
  displayName: string;
  avatarUrl?: string;
  email?: string;
  timezone: string;
  weekStartsOn: number;
  dstNotifications: boolean;
  kind: "anonymous" | "sso";
};

export type ScheduleSummary = {
  _id: Id<"schedules">;
  slug: string;
  title: string;
  description?: string;
  kind: ScheduleKind;
  timezone: string;
  createdAt: number;
  dateRangeStartMs?: number;
  dateRangeEndMs?: number;
};

export type GridCell = {
  key: string;
  instantMs: number;
  dateKey: string;
  minuteOfDay: number;
};

export type GridEntry = {
  cellKey: string;
  userId: Id<"users">;
  state: SlotState;
  avatarUrl?: string;
  displayName: string;
};

export type SelectedMarker = {
  cellKey: string;
  state: "selected";
};
