import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAnonymousUser } from "../hooks/useAnonymousUser";
import { useTimezone } from "../hooks/useTimezone";
import { useNavigate } from "react-router";
import { detectTimezone } from "../lib/timezone";

interface Props {
  onClose: () => void;
}

export function CreateScheduleModal({ onClose }: Props) {
  const navigate = useNavigate();
  const { anonymousId, displayName, setDisplayName } = useAnonymousUser();
  const { timezone } = useTimezone();

  const profile = useQuery(api.users.currentUserProfile, {
    anonymousId: anonymousId || undefined,
  });

  const createSchedule = useMutation(api.schedules.create);
  const getOrCreateProfile = useMutation(api.users.getOrCreateAnonymousProfile);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"one-off" | "recurring">("recurring");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [recurringStartDate, setRecurringStartDate] = useState("");
  const [creatorName, setCreatorName] = useState(displayName || "");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (type === "one-off" && (!dateStart || !dateEnd)) return;

    setIsSubmitting(true);

    try {
      // Ensure we have a profile
      let profileId = profile?._id;
      if (!profileId) {
        const name = creatorName.trim() || "Anonymous";
        profileId = await getOrCreateProfile({
          anonymousId,
          displayName: name,
          timezone: timezone || detectTimezone(),
        });
        if (name !== displayName) {
          setDisplayName(name);
        }
      }

      const scheduleId = await createSchedule({
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        creatorProfileId: profileId,
        anonymousId: anonymousId || undefined,
        dateRangeStart: type === "one-off" ? dateStart : undefined,
        dateRangeEnd: type === "one-off" ? dateEnd : undefined,
        recurringStartDate: type === "recurring" && recurringStartDate ? recurringStartDate : undefined,
        creatorTimezone: timezone || detectTimezone(),
        isPrivate: isPrivate || undefined,
      });

      navigate(`/schedule/${scheduleId}`);
    } catch (err) {
      console.error("Failed to create schedule:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 dark:bg-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold dark:text-slate-100">Create Schedule</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none dark:hover:text-slate-300"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Display name for anonymous users */}
          {!profile && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                Your Display Name
              </label>
              <input
                type="text"
                value={creatorName}
                onChange={(e) => setCreatorName(e.target.value)}
                placeholder="Enter your name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Friday Game Night"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
              Description{" "}
              <span className="text-gray-400 font-normal dark:text-slate-500">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this schedule for?"
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder-slate-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
              Type
            </label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="type"
                  value="one-off"
                  checked={type === "one-off"}
                  onChange={() => setType("one-off")}
                  className="text-blue-600"
                />
                <span className="text-sm dark:text-slate-300">One-off</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="type"
                  value="recurring"
                  checked={type === "recurring"}
                  onChange={() => setType("recurring")}
                  className="text-blue-600"
                />
                <span className="text-sm dark:text-slate-300">Recurring (weekly)</span>
              </label>
            </div>
          </div>

          {type === "one-off" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                  Start Date
                </label>
                <input
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                  End Date
                </label>
                <input
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  min={dateStart}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  required
                />
              </div>
            </div>
          )}

          {type === "recurring" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                Start Date{" "}
                <span className="text-gray-400 font-normal dark:text-slate-500">(optional)</span>
              </label>
              <input
                type="date"
                value={recurringStartDate}
                onChange={(e) => setRecurringStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-private"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="rounded text-blue-600"
              />
              <label htmlFor="is-private" className="text-sm text-gray-700 dark:text-slate-300">
                Unlisted schedule
              </label>
            </div>
            {isPrivate && (
              <p className="text-xs text-gray-500 mt-1 ml-6 dark:text-slate-400">
                Unlisted schedules are hidden from the public list but can still
                be viewed by anyone with the link.
              </p>
            )}
          </div>

          <div className="text-xs text-gray-400 dark:text-slate-500">
            My timezone: {timezone}. Others will see schedules in their own timezone.
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {isSubmitting ? "Creating..." : "Create Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
