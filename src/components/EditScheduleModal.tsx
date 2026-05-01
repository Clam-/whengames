import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useNavigate } from "react-router";

interface Schedule {
  _id: Id<"schedules">;
  title: string;
  description?: string;
  type: "one-off" | "recurring";
  dateRangeStart?: string;
  dateRangeEnd?: string;
  recurringStartDate?: string;
  isPrivate?: boolean;
}

interface Props {
  schedule: Schedule;
  onClose: () => void;
}

export function EditScheduleModal({ schedule, onClose }: Props) {
  const navigate = useNavigate();
  const updateSchedule = useMutation(api.schedules.update);
  const removeSchedule = useMutation(api.schedules.remove);
  const unblockParticipant = useMutation(api.schedules.unblockParticipant);

  // Load blocked profiles
  const blockedProfiles = useQuery(api.schedules.getBlockedProfiles, {
    scheduleId: schedule._id,
  });

  const [title, setTitle] = useState(schedule.title);
  const [description, setDescription] = useState(schedule.description || "");
  const [type, setType] = useState<"one-off" | "recurring">(schedule.type);
  const [dateStart, setDateStart] = useState(schedule.dateRangeStart || "");
  const [dateEnd, setDateEnd] = useState(schedule.dateRangeEnd || "");
  const [recurringStartDate, setRecurringStartDate] = useState(
    schedule.recurringStartDate || ""
  );
  const [isPrivate, setIsPrivate] = useState(schedule.isPrivate || false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isRecurringOriginal = schedule.type === "recurring";
  const isTypeChanged = type !== schedule.type;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (type === "one-off" && (!dateStart || !dateEnd)) return;

    setIsSubmitting(true);
    try {
      await updateSchedule({
        scheduleId: schedule._id,
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        dateRangeStart: type === "one-off" ? dateStart : undefined,
        dateRangeEnd: type === "one-off" ? dateEnd : undefined,
        recurringStartDate:
          type === "recurring" && recurringStartDate
            ? recurringStartDate
            : undefined,
        isPrivate,
      });
      onClose();
    } catch (err) {
      console.error("Failed to update schedule:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      await removeSchedule({ scheduleId: schedule._id });
      navigate("/");
    } catch (err) {
      console.error("Failed to delete schedule:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 relative dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
            Edit Schedule
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none dark:hover:text-slate-300"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              <label
                className={`flex items-center gap-2 ${isRecurringOriginal ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <input
                  type="radio"
                  name="type"
                  value="one-off"
                  checked={type === "one-off"}
                  onChange={() => setType("one-off")}
                  disabled={isRecurringOriginal}
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
            {isRecurringOriginal && (
              <p className="text-xs text-gray-400 mt-1 dark:text-slate-500">
                Recurring schedules cannot be changed to one-off.
              </p>
            )}
          </div>

          {/* Type change warning */}
          {isTypeChanged && !isRecurringOriginal && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 dark:bg-amber-900/30 dark:border-amber-700">
              <p className="text-sm text-amber-800 font-medium mb-1 dark:text-amber-300">
                Converting to recurring will:
              </p>
              <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5 dark:text-amber-400">
                <li>
                  Convert all nominations from date-specific to weekly
                  day-of-week (e.g. &ldquo;April 24&rdquo; becomes
                  &ldquo;every Friday&rdquo;)
                </li>
                <li>
                  If multiple weeks had different nominations for the same
                  day/time, the most recent week&apos;s choice is kept
                </li>
                <li>
                  Convert allow/disallow and locked time settings the same way
                </li>
                <li>Remove the date range restriction</li>
              </ul>
              <p className="text-xs text-amber-600 mt-2 dark:text-amber-500">
                This cannot be undone, but all existing data will be preserved
                in the new recurring format.
              </p>
            </div>
          )}

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
                id="edit-is-private"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="rounded text-blue-600"
              />
              <label
                htmlFor="edit-is-private"
                className="text-sm text-gray-700 dark:text-slate-300"
              >
                Private schedule
              </label>
            </div>
            {isPrivate && (
              <p className="text-xs text-gray-500 mt-1 ml-6 dark:text-slate-400">
                Private schedules can still be viewed by anyone with the link to
                this schedule.
              </p>
            )}
          </div>

          {/* Blocked users section */}
          {blockedProfiles && blockedProfiles.length > 0 && (
            <div className="border-t pt-4 dark:border-slate-700">
              <h3 className="text-sm font-medium text-gray-700 mb-2 dark:text-slate-300">
                Blocked Users
              </h3>
              <p className="text-xs text-gray-500 mb-3 dark:text-slate-400">
                Blocked users cannot enter availability for this schedule. Unblock to allow them to participate again.
              </p>
              <div className="space-y-2">
                {blockedProfiles.map((blocked) => (
                  <div
                    key={blocked._id}
                    className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 dark:bg-slate-700/50"
                  >
                    <div className="flex items-center gap-2">
                      {blocked.profileImageUrl ? (
                        <img
                          src={blocked.profileImageUrl}
                          alt=""
                          className="w-5 h-5 rounded-full"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center">
                          <span className="text-[10px] text-gray-500 dark:text-slate-400">
                            {blocked.displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span className="text-xs text-gray-700 dark:text-slate-300">
                        {blocked.displayName}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await unblockParticipant({
                          scheduleId: schedule._id,
                          profileId: blocked.profileId,
                        });
                      }}
                      className="text-xs px-2 py-1 rounded text-blue-600 hover:bg-blue-50 border border-blue-200 hover:border-blue-300 transition-colors dark:text-blue-400 dark:hover:bg-blue-900/40 dark:border-blue-800 dark:hover:border-blue-700"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Delete section */}
          <div className="border-t pt-4 dark:border-slate-700">
            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-xs px-3 py-1.5 rounded text-red-600 hover:bg-red-50 border border-red-200 hover:border-red-300 transition-colors dark:text-rose-400 dark:hover:bg-rose-900/40 dark:border-rose-800 dark:hover:border-red-700"
              >
                Delete Schedule
              </button>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 dark:bg-rose-900/40 dark:border-rose-800">
                <p className="text-sm text-red-700 mb-3 dark:text-rose-400">
                  Are you sure? This will permanently delete &ldquo;
                  {schedule.title}&rdquo; and all nominations, settings, and
                  linked availabilities. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors dark:text-slate-400 dark:hover:bg-slate-700"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isSubmitting}
                    className="flex-1 bg-red-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? "Deleting..." : "Delete Forever"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer buttons */}
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
              disabled={isSubmitting || !title.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
